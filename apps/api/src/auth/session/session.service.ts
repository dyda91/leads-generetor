import type { PrismaClient, Session, User } from '../../generated/prisma/client';

import type { Clock } from './clock';
import type { SessionConfig } from './session-config';
import {
  InvalidSessionError,
  InvalidSessionTokenError,
  SessionConflictError,
  UserNotActiveError,
  isUniqueConstraintError,
} from './session-errors';
import type { SafePrincipal } from './session.types';
import {
  generateCsrfToken,
  generateSessionToken,
  isValidCsrfToken,
  isValidSessionToken,
  safeTokenEqual,
  storedCsrfHash,
  storedSessionHash,
} from './tokens';

export interface NewSession {
  sessionToken: string;
  csrfToken: string;
}

type SessionWithUser = Session & { user: User };

/**
 * Opaque server-side sessions with a single active session per user. All time
 * comes from the injectable Clock; tokens are only ever hashed (domain-separated
 * SHA-256) in the database. Boundaries: expiresAt <= now is expired,
 * lastUsedAt + idleTtl <= now is inactive, and a session created strictly before
 * the user's passwordChangedAt is invalid (createdAt equal to it is valid).
 */
export class SessionService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly clock: Clock,
    private readonly config: SessionConfig,
  ) {}

  async createSession(userId: string): Promise<NewSession> {
    return this.withSingleSessionConflictRetry(() => this.createSessionOnce(userId));
  }

  private async createSessionOnce(userId: string): Promise<NewSession> {
    const sessionToken = generateSessionToken();
    const csrfToken = generateCsrfToken();
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + this.config.absoluteTtlMs);

    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (user === null || user.status !== 'ACTIVE') {
        throw new UserNotActiveError();
      }
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.session.create({
        data: {
          userId,
          tokenHash: storedSessionHash(sessionToken),
          csrfTokenHash: storedCsrfHash(csrfToken),
          expiresAt,
          lastUsedAt: now,
        },
      });
    });

    return { sessionToken, csrfToken };
  }

  async validateSession(sessionToken: string): Promise<SafePrincipal> {
    return (await this.resolveSession(sessionToken)).principal;
  }

  /**
   * Resolves the principal AND the csrfTokenHash observed during validation.
   * The hash is the compare-and-set expected value for `rotateCsrfToken`, so a
   * concurrent rotation (whose guard observed the same hash) is detected.
   */
  async resolveSession(
    sessionToken: string,
  ): Promise<{ principal: SafePrincipal; csrfTokenHash: string }> {
    if (!isValidSessionToken(sessionToken)) {
      throw new InvalidSessionTokenError();
    }
    const tokenHash = storedSessionHash(sessionToken);
    const now = this.clock.now();
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });
    if (session === null) {
      throw new InvalidSessionError();
    }
    this.assertValid(session, now);
    return {
      principal: {
        userId: session.userId,
        email: session.user.email,
        role: session.user.role,
        status: session.user.status,
        sessionId: session.id,
      },
      csrfTokenHash: session.csrfTokenHash,
    };
  }

  async validateCsrfToken(sessionId: string, csrfToken: string): Promise<boolean> {
    if (!isValidCsrfToken(csrfToken)) {
      return false;
    }
    const csrfTokenHash = storedCsrfHash(csrfToken);
    const session = await this.prisma.session.findUnique({ where: { id: sessionId } });
    if (session === null) {
      return false;
    }
    return safeTokenEqual(session.csrfTokenHash, csrfTokenHash);
  }

  async rotateSession(sessionId: string, userId: string): Promise<NewSession> {
    return this.withSingleSessionConflictRetry(() => this.rotateSessionOnce(sessionId, userId));
  }

  private async rotateSessionOnce(sessionId: string, userId: string): Promise<NewSession> {
    const sessionToken = generateSessionToken();
    const csrfToken = generateCsrfToken();
    const now = this.clock.now();
    const expiresAt = new Date(now.getTime() + this.config.absoluteTtlMs);

    await this.prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({ where: { id: userId } });
      if (user === null || user.status !== 'ACTIVE') {
        throw new UserNotActiveError();
      }
      const current = await tx.session.findFirst({
        where: { id: sessionId, userId, revokedAt: null },
      });
      if (current === null) {
        throw new InvalidSessionError();
      }
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: now },
      });
      await tx.session.create({
        data: {
          userId,
          tokenHash: storedSessionHash(sessionToken),
          csrfTokenHash: storedCsrfHash(csrfToken),
          expiresAt,
          lastUsedAt: now,
        },
      });
    });

    return { sessionToken, csrfToken };
  }

  /**
   * Optimistic compare-and-set rotation of the CSRF token for the current
   * session. The update is conditioned on the hash the request observed during
   * session validation, so under concurrent `/auth/me` calls exactly one request
   * persists its new hash and wins (200); the loser gets a controlled
   * SessionConflictError (409) and never returns a token. A revoked/gone session
   * maps to InvalidSessionError (401).
   */
  async rotateCsrfToken(sessionId: string, expectedCsrfTokenHash: string): Promise<string> {
    const csrfToken = generateCsrfToken();
    const result = await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null, csrfTokenHash: expectedCsrfTokenHash },
      data: { csrfTokenHash: storedCsrfHash(csrfToken) },
    });
    if (result.count === 0) {
      const current = await this.prisma.session.findUnique({ where: { id: sessionId } });
      if (current === null || current.revokedAt !== null) {
        throw new InvalidSessionError();
      }
      throw new SessionConflictError();
    }
    return csrfToken;
  }

  /**
   * Password change with an explicit decision about the current session: the new
   * hash and passwordChangedAt are written, every session is revoked, and the
   * current session is kept by rotating it to a fresh session token + CSRF token
   * (created after passwordChangedAt, so the new session survives). Runs in one
   * transaction with the same bounded retry as create/rotate.
   */
  async changePasswordWithRotation(
    userId: string,
    sessionId: string,
    newPasswordHash: string,
  ): Promise<NewSession> {
    return this.withSingleSessionConflictRetry(() =>
      this.prisma.$transaction(async (tx) => {
        const user = await tx.user.findUnique({ where: { id: userId } });
        if (user === null || user.status !== 'ACTIVE') {
          throw new UserNotActiveError();
        }
        const current = await tx.session.findFirst({
          where: { id: sessionId, userId, revokedAt: null },
        });
        if (current === null) {
          throw new InvalidSessionError();
        }

        const sessionToken = generateSessionToken();
        const csrfToken = generateCsrfToken();
        const now = this.clock.now();

        await tx.user.update({
          where: { id: userId },
          data: { passwordHash: newPasswordHash, passwordChangedAt: now },
        });
        await tx.session.updateMany({
          where: { userId, revokedAt: null },
          data: { revokedAt: now },
        });
        await tx.session.create({
          data: {
            userId,
            tokenHash: storedSessionHash(sessionToken),
            csrfTokenHash: storedCsrfHash(csrfToken),
            expiresAt: new Date(now.getTime() + this.config.absoluteTtlMs),
            lastUsedAt: now,
            createdAt: now,
          },
        });

        return { sessionToken, csrfToken };
      }),
    );
  }

  /**
   * Runs the single-active-session transaction and retries exactly once when a
   * concurrent login wins the partial-unique-index race, so a legitimate
   * simultaneous login is not randomly rejected. A second conflict becomes a
   * controlled SessionConflictError — never a Prisma/index/table/SQL detail.
   */
  private async withSingleSessionConflictRetry<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          throw error;
        }
      }
    }
    throw new SessionConflictError();
  }

  async touchSession(sessionId: string): Promise<void> {
    const now = this.clock.now();
    await this.prisma.session.updateMany({
      where: {
        id: sessionId,
        revokedAt: null,
        expiresAt: { gt: now },
        lastUsedAt: { lte: new Date(now.getTime() - this.config.touchIntervalMs) },
      },
      data: { lastUsedAt: now },
    });
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: this.clock.now() },
    });
  }

  async revokeAllSessions(userId: string): Promise<number> {
    const result = await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: this.clock.now() },
    });
    return result.count;
  }

  async cleanupExpired(): Promise<number> {
    const now = this.clock.now();
    const result = await this.prisma.session.deleteMany({
      where: { OR: [{ expiresAt: { lte: now } }, { revokedAt: { not: null } }] },
    });
    return result.count;
  }

  private assertValid(session: SessionWithUser, now: Date): void {
    if (session.revokedAt !== null) {
      throw new InvalidSessionError();
    }
    if (session.expiresAt.getTime() <= now.getTime()) {
      throw new InvalidSessionError();
    }
    if (session.lastUsedAt.getTime() + this.config.idleTtlMs <= now.getTime()) {
      throw new InvalidSessionError();
    }
    if (session.user.status !== 'ACTIVE') {
      throw new InvalidSessionError();
    }
    if (
      session.user.passwordChangedAt !== null &&
      session.createdAt.getTime() < session.user.passwordChangedAt.getTime()
    ) {
      throw new InvalidSessionError();
    }
  }
}
