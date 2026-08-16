import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { EnvironmentService } from '../config/environment.service';
import { SESSION_COOKIE_MAX_LENGTH } from './auth.constants';
import { forbiddenException, unauthorizedException } from './auth-errors';
import type { AuthenticatedRequest } from './auth.types';
import { parseCookies } from './cookie';
import { sessionCookieName } from './cookie-policy';
import { ROLES_METADATA } from './roles.decorator';
import { InvalidSessionError, InvalidSessionTokenError } from './session/session-errors';
import { SessionService } from './session/session.service';
import type { SafePrincipal } from './session/session.types';

const DEFAULT_REQUIRED_ROLES: readonly string[] = ['ADMIN'];

/**
 * Authentication + authorization guard: cookie -> hashed lookup -> valid session
 * -> ACTIVE user -> required role (default ADMIN). Deny by default: a missing,
 * malformed, expired or revoked session yields 401; a valid session without the
 * required role yields 403. The principal is never built from client-supplied
 * fields. On success it touches lastUsedAt (throttled) and attaches the typed
 * principal for CurrentUser — the trusted ownership source for future resources.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    @Inject(SessionService) private readonly sessionService: SessionService,
    @Inject(EnvironmentService) private readonly environmentService: EnvironmentService,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const sessionToken = this.readSessionToken(request);
    let resolved: { principal: SafePrincipal; csrfTokenHash: string };
    try {
      resolved = await this.sessionService.resolveSession(sessionToken);
    } catch (error) {
      if (error instanceof InvalidSessionTokenError || error instanceof InvalidSessionError) {
        throw unauthorizedException();
      }
      throw error;
    }
    this.assertAllowedRole(context, resolved.principal);
    request.user = resolved.principal;
    // Internal compare-and-set expected value for CSRF rotation; never exposed
    // to the client.
    request.expectedCsrfTokenHash = resolved.csrfTokenHash;
    await this.sessionService.touchSession(resolved.principal.sessionId);
    return true;
  }

  private assertAllowedRole(context: ExecutionContext, principal: SafePrincipal): void {
    const requiredRoles =
      this.reflector.getAllAndOverride<readonly string[]>(ROLES_METADATA, [
        context.getHandler(),
        context.getClass(),
      ]) ?? DEFAULT_REQUIRED_ROLES;
    if (!requiredRoles.includes(principal.role)) {
      throw forbiddenException();
    }
  }

  private readSessionToken(request: AuthenticatedRequest): string {
    const cookieName = sessionCookieName(this.environmentService.nodeEnv);
    const raw = request.headers.cookie ?? '';
    const value = parseCookies(raw)[cookieName];
    if (value === undefined || value.length === 0 || value.length > SESSION_COOKIE_MAX_LENGTH) {
      throw unauthorizedException();
    }
    return value;
  }
}
