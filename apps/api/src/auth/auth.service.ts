import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import type { Response } from 'express';

import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../prisma/prisma.service';
import { authUserFromPrincipal } from './auth.types';
import type { AuthUser, LoginResponse, MeResponse } from './auth.types';
import { conflictException, forbiddenException, unauthorizedException } from './auth-errors';
import { DUMMY_PASSWORD_HASH } from './auth.constants';
import {
  assertSafeCookieOptions,
  sessionClearCookieOptions,
  sessionCookieName,
  sessionCookieOptions,
} from './cookie-policy';
import type { ChangePasswordDto } from './dto/change-password.dto';
import type { LoginDto } from './dto/login.dto';
import { normalizeEmail, EmailValidationError } from './email';
import { OriginRejectedError, OriginValidator } from './origin-validator';
import { assertPasswordPolicy, PasswordPolicyError } from './password-policy';
import { PasswordService } from './password.service';
import {
  SessionConflictError,
  InvalidSessionError,
  UserNotActiveError,
} from './session/session-errors';
import type { SafePrincipal } from './session/session.types';
import { SessionService } from './session/session.service';

/**
 * Authentication operations. All failures use the controlled envelope: login is
 * uniformly rejected (401) for unknown e-mail, inactive user or wrong password,
 * and every syntactically valid credential attempt performs exactly one Argon2id
 * verification (a per-instance dummy hash is used for unknown/inactive users so
 * the timing signal does not reveal account existence). CSRF/origin failures are
 * 403; a concurrent CSRF rotation conflict is 409. No password, hash, token or
 * cookie is ever placed in a JSON body.
 */
@Injectable()
export class AuthService {
  private readonly originValidator: OriginValidator;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(PasswordService) private readonly passwordService: PasswordService,
    @Inject(SessionService) private readonly sessionService: SessionService,
    @Inject(EnvironmentService) private readonly environmentService: EnvironmentService,
    @Inject(DUMMY_PASSWORD_HASH) private readonly dummyPasswordHash: string,
  ) {
    this.originValidator = new OriginValidator(new Set(this.environmentService.corsOrigins));
  }

  async login(
    dto: LoginDto,
    res: Response,
    origin: string | undefined,
    referer: string | undefined,
  ): Promise<LoginResponse> {
    try {
      this.originValidator.validate(origin, referer);
    } catch (error) {
      if (error instanceof OriginRejectedError) {
        throw forbiddenException();
      }
      throw error;
    }

    let email: string;
    try {
      email = normalizeEmail(dto.email);
    } catch (error) {
      if (error instanceof EmailValidationError) {
        throw unauthorizedException();
      }
      throw error;
    }

    const user = await this.prisma.user.findUnique({ where: { email } });

    // Exactly one Argon2id verification per syntactically valid attempt. Unknown
    // and INACTIVE users verify against the in-memory dummy hash so the timing
    // signal does not distinguish "no such user" from "wrong password".
    const hashToVerify =
      user === null || user.status !== 'ACTIVE' ? this.dummyPasswordHash : user.passwordHash;

    let passwordValid: boolean;
    try {
      passwordValid = await this.passwordService.verify(dto.password, hashToVerify);
    } catch {
      // A stored hash that fails verification (e.g. malformed) is treated as an
      // invalid credential: fall back to a dummy verify to keep the timing signal
      // uniform, then reject without ever leaking the cause.
      await this.passwordService.verify(dto.password, this.dummyPasswordHash);
      throw unauthorizedException();
    }
    if (!passwordValid) {
      throw unauthorizedException();
    }
    if (user === null || user.status !== 'ACTIVE') {
      throw unauthorizedException();
    }

    if (this.passwordService.needsRehash(user.passwordHash)) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await this.passwordService.hash(dto.password) },
      });
    }

    let sessionToken: string;
    let csrfToken: string;
    try {
      const session = await this.sessionService.createSession(user.id);
      sessionToken = session.sessionToken;
      csrfToken = session.csrfToken;
    } catch (error) {
      if (error instanceof UserNotActiveError) {
        throw unauthorizedException();
      }
      if (error instanceof SessionConflictError) {
        throw conflictException();
      }
      throw error;
    }

    this.setSessionCookie(res, sessionToken);
    return { user: authUserFromUser(user), csrfToken };
  }

  async me(principal: SafePrincipal, expectedCsrfTokenHash: string): Promise<MeResponse> {
    let csrfToken: string;
    try {
      csrfToken = await this.sessionService.rotateCsrfToken(
        principal.sessionId,
        expectedCsrfTokenHash,
      );
    } catch (error) {
      if (error instanceof InvalidSessionError) {
        throw unauthorizedException();
      }
      if (error instanceof SessionConflictError) {
        throw conflictException();
      }
      throw error;
    }
    return { user: authUserFromPrincipal(principal), csrfToken };
  }

  async logout(
    principal: SafePrincipal,
    res: Response,
    origin: string | undefined,
    referer: string | undefined,
    csrfToken: string | undefined,
  ): Promise<void> {
    await this.assertMutation(principal, origin, referer, csrfToken);
    await this.sessionService.revokeSession(principal.sessionId);
    this.clearSessionCookie(res);
  }

  async changePassword(
    principal: SafePrincipal,
    dto: ChangePasswordDto,
    res: Response,
    origin: string | undefined,
    referer: string | undefined,
    csrfToken: string | undefined,
  ): Promise<LoginResponse> {
    await this.assertMutation(principal, origin, referer, csrfToken);

    const user = await this.prisma.user.findUnique({ where: { id: principal.userId } });
    if (user === null || user.status !== 'ACTIVE') {
      throw unauthorizedException();
    }
    const currentValid = await this.passwordService.verify(dto.currentPassword, user.passwordHash);
    if (!currentValid) {
      throw unauthorizedException();
    }

    try {
      assertPasswordPolicy(dto.newPassword);
    } catch (error) {
      if (error instanceof PasswordPolicyError) {
        throw new BadRequestException();
      }
      throw error;
    }

    const newPasswordHash = await this.passwordService.hash(dto.newPassword);
    let sessionToken: string;
    let newCsrfToken: string;
    try {
      const rotated = await this.sessionService.changePasswordWithRotation(
        principal.userId,
        principal.sessionId,
        newPasswordHash,
      );
      sessionToken = rotated.sessionToken;
      newCsrfToken = rotated.csrfToken;
    } catch (error) {
      if (error instanceof UserNotActiveError || error instanceof InvalidSessionError) {
        throw unauthorizedException();
      }
      if (error instanceof SessionConflictError) {
        throw conflictException();
      }
      throw error;
    }

    this.setSessionCookie(res, sessionToken);
    return { user: authUserFromPrincipal(principal), csrfToken: newCsrfToken };
  }

  private async assertMutation(
    principal: SafePrincipal,
    origin: string | undefined,
    referer: string | undefined,
    csrfToken: string | undefined,
  ): Promise<void> {
    try {
      this.originValidator.validate(origin, referer);
    } catch (error) {
      if (error instanceof OriginRejectedError) {
        throw forbiddenException();
      }
      throw error;
    }
    if (csrfToken === undefined) {
      throw forbiddenException();
    }
    const valid = await this.sessionService.validateCsrfToken(principal.sessionId, csrfToken);
    if (!valid) {
      throw forbiddenException();
    }
  }

  private setSessionCookie(res: Response, sessionToken: string): void {
    const options = sessionCookieOptions(
      this.environmentService.nodeEnv,
      this.environmentService.sessionAbsoluteTtlMs,
    );
    assertSafeCookieOptions(
      this.environmentService.nodeEnv,
      options,
      this.environmentService.sessionAbsoluteTtlMs,
    );
    res.cookie(sessionCookieName(this.environmentService.nodeEnv), sessionToken, options);
  }

  private clearSessionCookie(res: Response): void {
    res.clearCookie(
      sessionCookieName(this.environmentService.nodeEnv),
      sessionClearCookieOptions(this.environmentService.nodeEnv),
    );
  }
}

function authUserFromUser(user: {
  id: string;
  email: string;
  role: 'ADMIN';
  status: 'ACTIVE' | 'INACTIVE';
}): AuthUser {
  return { id: user.id, email: user.email, role: user.role, status: user.status };
}
