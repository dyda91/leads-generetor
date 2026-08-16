import 'reflect-metadata';

import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { PrismaPg } from '@prisma/adapter-pg';

import type { Clock } from '../src/auth/session/clock';
import {
  InvalidSessionError,
  InvalidSessionTokenError,
  SessionConflictError,
  UserNotActiveError,
} from '../src/auth/session/session-errors';
import type { SessionConfig } from '../src/auth/session/session-config';
import { SessionService } from '../src/auth/session/session.service';
import {
  generateCsrfToken,
  generateSessionToken,
  storedCsrfHash,
  storedSessionHash,
} from '../src/auth/session/tokens';
import { PrismaClient, type Session } from '../src/generated/prisma/client';
import { validateTestDatabaseUrl } from './test-db-guard';

const TEST_URL = process.env.DATABASE_URL_TEST ?? '';

class FakeClock implements Clock {
  private current: number;
  constructor(start: number) {
    this.current = start;
  }
  now(): Date {
    return new Date(this.current);
  }
  advance(ms: number): void {
    this.current += ms;
  }
}

const sessionConfig: SessionConfig = {
  absoluteTtlMs: 60_000,
  idleTtlMs: 5_000,
  touchIntervalMs: 1_000,
};

const USER_ID = 'u_session_test';
const USER_EMAIL = 'session@example.com';

function requireSession(session: Session | null): Session {
  expect(session).not.toBeNull();
  if (session === null) {
    throw new Error('Expected session to exist');
  }
  return session;
}

function requireSingleSession(rows: readonly Session[]): Session {
  expect(rows).toHaveLength(1);
  return requireSession(rows[0] ?? null);
}

let prisma: PrismaClient;
let clock: FakeClock;
let service: SessionService;

beforeAll(async () => {
  validateTestDatabaseUrl(TEST_URL);
  const adapter = new PrismaPg({ connectionString: TEST_URL });
  prisma = new PrismaClient({ adapter });
  await prisma.$connect();
  await prisma.user.create({
    data: {
      id: USER_ID,
      email: USER_EMAIL,
      passwordHash: 'not-a-real-hash',
      role: 'ADMIN',
      status: 'ACTIVE',
      updatedAt: new Date(),
    },
  });
  clock = new FakeClock(1_700_000_000_000);
  service = new SessionService(prisma, clock, sessionConfig);
});

afterEach(async () => {
  await prisma.session.deleteMany({});
  await prisma.user.update({
    where: { id: USER_ID },
    data: { status: 'ACTIVE', passwordChangedAt: null },
  });
});

afterAll(async () => {
  await prisma.user.deleteMany({});
  await prisma.$disconnect();
});

describe('SessionService (isolated test database)', () => {
  it('creates a session storing only domain-separated hashes', async () => {
    const result = await service.createSession(USER_ID);

    expect(result.sessionToken).toMatch(/^[0-9a-f]{64}$/);
    expect(result.csrfToken).toMatch(/^[0-9a-f]{64}$/);
    expect(result.sessionToken).not.toBe(result.csrfToken);

    const rows = await prisma.session.findMany({ where: { userId: USER_ID } });
    const row = requireSingleSession(rows);
    expect(row.tokenHash).toBe(storedSessionHash(result.sessionToken));
    expect(row.csrfTokenHash).toBe(storedCsrfHash(result.csrfToken));
    expect(row.tokenHash).not.toContain(result.sessionToken);
    expect(row.csrfTokenHash).not.toContain(result.csrfToken);
    expect(row.revokedAt).toBeNull();
    expect(row.expiresAt.getTime()).toBe(clock.now().getTime() + sessionConfig.absoluteTtlMs);
  });

  it('keeps exactly one active session per user, revoking the previous', async () => {
    const first = await service.createSession(USER_ID);
    const second = await service.createSession(USER_ID);

    const active = await prisma.session.findMany({ where: { revokedAt: null } });
    expect(requireSingleSession(active).tokenHash).toBe(storedSessionHash(second.sessionToken));

    await expect(service.validateSession(first.sessionToken)).rejects.toBeInstanceOf(
      InvalidSessionError,
    );
    await expect(service.validateSession(second.sessionToken)).resolves.toMatchObject({
      userId: USER_ID,
      role: 'ADMIN',
      status: 'ACTIVE',
    });
  });

  it('does not create a session for an inactive user', async () => {
    await prisma.user.update({ where: { id: USER_ID }, data: { status: 'INACTIVE' } });
    await expect(service.createSession(USER_ID)).rejects.toBeInstanceOf(UserNotActiveError);
    expect(await prisma.session.count()).toBe(0);
  });

  it('leaves exactly one active session under concurrent creation', async () => {
    const results = await Promise.allSettled([
      service.createSession(USER_ID),
      service.createSession(USER_ID),
    ]);
    for (const result of results) {
      if (result.status === 'rejected') {
        expect(result.reason).toBeInstanceOf(SessionConflictError);
      }
    }
    expect(await prisma.session.count({ where: { revokedAt: null } })).toBe(1);
  });

  it('returns a minimal safe principal without any secrets', async () => {
    const { sessionToken } = await service.createSession(USER_ID);
    const principal = await service.validateSession(sessionToken);

    expect(principal).toEqual({
      userId: USER_ID,
      email: USER_EMAIL,
      role: 'ADMIN',
      status: 'ACTIVE',
      sessionId: expect.any(String),
    });
    expect(principal).not.toHaveProperty('passwordHash');
    expect(principal).not.toHaveProperty('tokenHash');
    expect(principal).not.toHaveProperty('csrfTokenHash');
  });

  it('rejects a malformed token without consulting the database', async () => {
    await expect(service.validateSession('short')).rejects.toBeInstanceOf(InvalidSessionTokenError);
    await expect(service.validateSession('G'.repeat(64))).rejects.toBeInstanceOf(
      InvalidSessionTokenError,
    );
  });

  it('rejects an unknown session token', async () => {
    await expect(service.validateSession(generateSessionToken())).rejects.toBeInstanceOf(
      InvalidSessionError,
    );
  });

  it('rejects revoked, expired and idle sessions at the boundaries', async () => {
    const { sessionToken } = await service.createSession(USER_ID);
    const session = requireSession(
      await prisma.session.findUnique({ where: { tokenHash: storedSessionHash(sessionToken) } }),
    );

    await prisma.session.update({ where: { id: session.id }, data: { revokedAt: clock.now() } });
    await expect(service.validateSession(sessionToken)).rejects.toBeInstanceOf(InvalidSessionError);
    await prisma.session.update({ where: { id: session.id }, data: { revokedAt: null } });

    await prisma.session.update({ where: { id: session.id }, data: { expiresAt: clock.now() } });
    await expect(service.validateSession(sessionToken)).rejects.toBeInstanceOf(InvalidSessionError);
    await prisma.session.update({
      where: { id: session.id },
      data: { expiresAt: new Date(clock.now().getTime() + sessionConfig.absoluteTtlMs) },
    });

    await prisma.session.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date(clock.now().getTime() - sessionConfig.idleTtlMs) },
    });
    await expect(service.validateSession(sessionToken)).rejects.toBeInstanceOf(InvalidSessionError);

    await prisma.session.update({ where: { id: session.id }, data: { lastUsedAt: clock.now() } });
    await expect(service.validateSession(sessionToken)).resolves.toMatchObject({
      sessionId: session.id,
    });
  });

  it('rejects when the user is inactive or the password changed after creation', async () => {
    const { sessionToken } = await service.createSession(USER_ID);
    const session = requireSession(
      await prisma.session.findUnique({ where: { tokenHash: storedSessionHash(sessionToken) } }),
    );

    await prisma.user.update({ where: { id: USER_ID }, data: { status: 'INACTIVE' } });
    await expect(service.validateSession(sessionToken)).rejects.toBeInstanceOf(InvalidSessionError);
    await prisma.user.update({ where: { id: USER_ID }, data: { status: 'ACTIVE' } });

    await prisma.user.update({
      where: { id: USER_ID },
      data: { passwordChangedAt: new Date(session.createdAt.getTime() + 1) },
    });
    await expect(service.validateSession(sessionToken)).rejects.toBeInstanceOf(InvalidSessionError);

    await prisma.user.update({
      where: { id: USER_ID },
      data: { passwordChangedAt: new Date(session.createdAt.getTime()) },
    });
    await expect(service.validateSession(sessionToken)).resolves.toBeDefined();
  });

  it('validates CSRF tokens without leaking values', async () => {
    const { sessionToken, csrfToken } = await service.createSession(USER_ID);
    const session = requireSession(
      await prisma.session.findUnique({ where: { tokenHash: storedSessionHash(sessionToken) } }),
    );

    expect(await service.validateCsrfToken(session.id, csrfToken)).toBe(true);
    expect(await service.validateCsrfToken(session.id, generateCsrfToken())).toBe(false);
    expect(await service.validateCsrfToken('u_nonexistent', csrfToken)).toBe(false);
    expect(await service.validateCsrfToken(session.id, 'G'.repeat(64))).toBe(false);
    expect(await service.validateCsrfToken(session.id, '')).toBe(false);
  });

  it('rotates the session and invalidates the old one', async () => {
    const { sessionToken, csrfToken } = await service.createSession(USER_ID);
    const session = requireSession(
      await prisma.session.findUnique({ where: { tokenHash: storedSessionHash(sessionToken) } }),
    );

    const rotated = await service.rotateSession(session.id, USER_ID);
    expect(rotated.sessionToken).not.toBe(sessionToken);
    expect(rotated.csrfToken).not.toBe(csrfToken);

    const principal = await service.validateSession(rotated.sessionToken);
    expect(principal.sessionId).not.toBe(session.id);
    await expect(service.validateSession(sessionToken)).rejects.toBeInstanceOf(InvalidSessionError);

    const newSession = requireSession(
      await prisma.session.findUnique({
        where: { tokenHash: storedSessionHash(rotated.sessionToken) },
      }),
    );
    expect(await service.validateCsrfToken(newSession.id, rotated.csrfToken)).toBe(true);
    expect(await service.validateCsrfToken(newSession.id, csrfToken)).toBe(false);
  });

  it('rolls back rotation when the user becomes inactive', async () => {
    const { sessionToken } = await service.createSession(USER_ID);
    const session = requireSession(
      await prisma.session.findUnique({ where: { tokenHash: storedSessionHash(sessionToken) } }),
    );

    await prisma.user.update({ where: { id: USER_ID }, data: { status: 'INACTIVE' } });
    await expect(service.rotateSession(session.id, USER_ID)).rejects.toBeInstanceOf(
      UserNotActiveError,
    );
    await prisma.user.update({ where: { id: USER_ID }, data: { status: 'ACTIVE' } });

    expect(await prisma.session.count({ where: { revokedAt: null } })).toBe(1);
    await expect(service.validateSession(sessionToken)).resolves.toBeDefined();
  });

  it('rejects rotation of a session that is no longer active', async () => {
    const { sessionToken } = await service.createSession(USER_ID);
    const session = requireSession(
      await prisma.session.findUnique({ where: { tokenHash: storedSessionHash(sessionToken) } }),
    );

    await service.rotateSession(session.id, USER_ID);
    await expect(service.rotateSession(session.id, USER_ID)).rejects.toBeInstanceOf(
      InvalidSessionError,
    );
  });

  it('leaves exactly one active session under concurrent rotation', async () => {
    const { sessionToken } = await service.createSession(USER_ID);
    const session = requireSession(
      await prisma.session.findUnique({ where: { tokenHash: storedSessionHash(sessionToken) } }),
    );

    const results = await Promise.allSettled([
      service.rotateSession(session.id, USER_ID),
      service.rotateSession(session.id, USER_ID),
    ]);
    for (const result of results) {
      if (result.status === 'rejected') {
        // Either a genuine conflict (retry also lost) or the loser retrying
        // against the already-rotated session — always a controlled error.
        expect(result.reason).toBeInstanceOf(InvalidSessionError);
      }
    }
    expect(await prisma.session.count({ where: { revokedAt: null } })).toBe(1);
  });

  it('only touches the session after the touch interval elapses', async () => {
    const { sessionToken } = await service.createSession(USER_ID);
    const session = requireSession(
      await prisma.session.findUnique({ where: { tokenHash: storedSessionHash(sessionToken) } }),
    );

    const firstTouch = session.lastUsedAt.getTime();
    clock.advance(500);
    await service.touchSession(session.id);
    expect(
      requireSession(
        await prisma.session.findUnique({ where: { id: session.id } }),
      ).lastUsedAt.getTime(),
    ).toBe(firstTouch);

    clock.advance(600);
    await service.touchSession(session.id);
    expect(
      requireSession(
        await prisma.session.findUnique({ where: { id: session.id } }),
      ).lastUsedAt.getTime(),
    ).toBeGreaterThan(firstTouch);
  });

  it('touch never extends the absolute expiry and ignores invalid sessions', async () => {
    const { sessionToken } = await service.createSession(USER_ID);
    const session = requireSession(
      await prisma.session.findUnique({ where: { tokenHash: storedSessionHash(sessionToken) } }),
    );

    const originalExpiry = session.expiresAt.getTime();
    clock.advance(sessionConfig.touchIntervalMs + 1);
    await service.touchSession(session.id);
    const touched = requireSession(await prisma.session.findUnique({ where: { id: session.id } }));
    expect(touched.expiresAt.getTime()).toBe(originalExpiry);

    await expect(service.touchSession('u_nonexistent')).resolves.toBeUndefined();
    await prisma.session.update({ where: { id: session.id }, data: { revokedAt: clock.now() } });
    await expect(service.touchSession(session.id)).resolves.toBeUndefined();
  });

  it('handles concurrent touches without breaking the session', async () => {
    const { sessionToken } = await service.createSession(USER_ID);
    const session = requireSession(
      await prisma.session.findUnique({ where: { tokenHash: storedSessionHash(sessionToken) } }),
    );

    clock.advance(sessionConfig.touchIntervalMs + 1);
    await Promise.all([service.touchSession(session.id), service.touchSession(session.id)]);
    await expect(service.validateSession(sessionToken)).resolves.toMatchObject({
      sessionId: session.id,
    });
  });

  it('revokeSession revokes only the current session', async () => {
    const first = await service.createSession(USER_ID);
    const second = await service.createSession(USER_ID);

    const active = await prisma.session.findMany({ where: { revokedAt: null } });
    const secondSession = requireSingleSession(active);
    await service.revokeSession(secondSession.id);

    await expect(service.validateSession(second.sessionToken)).rejects.toBeInstanceOf(
      InvalidSessionError,
    );
    await expect(service.validateSession(first.sessionToken)).rejects.toBeInstanceOf(
      InvalidSessionError,
    );
    expect(await prisma.session.count({ where: { revokedAt: null } })).toBe(0);
  });

  it('revokeSession is idempotent and safe for unknown sessions', async () => {
    const { sessionToken } = await service.createSession(USER_ID);
    const session = requireSession(
      await prisma.session.findUnique({ where: { tokenHash: storedSessionHash(sessionToken) } }),
    );

    await expect(service.revokeSession(session.id)).resolves.toBeUndefined();
    await expect(service.revokeSession(session.id)).resolves.toBeUndefined();
    await expect(service.revokeSession('u_nonexistent')).resolves.toBeUndefined();
    expect(await prisma.session.count({ where: { revokedAt: null } })).toBe(0);
  });

  it('revokeAllSessions revokes every active session of the user', async () => {
    const a = await service.createSession(USER_ID);
    const b = await service.createSession(USER_ID);
    const revoked = await service.revokeAllSessions(USER_ID);
    expect(revoked).toBe(1);
    await expect(service.validateSession(a.sessionToken)).rejects.toBeInstanceOf(
      InvalidSessionError,
    );
    await expect(service.validateSession(b.sessionToken)).rejects.toBeInstanceOf(
      InvalidSessionError,
    );
    expect(await prisma.session.count({ where: { revokedAt: null } })).toBe(0);
  });

  it('revokes an expired-but-not-revoked session before creating a new one', async () => {
    const first = await service.createSession(USER_ID);
    const firstSession = requireSession(
      await prisma.session.findUnique({
        where: { tokenHash: storedSessionHash(first.sessionToken) },
      }),
    );

    clock.advance(sessionConfig.absoluteTtlMs + 1);
    await prisma.session.update({
      where: { id: firstSession.id },
      data: { expiresAt: clock.now() },
    });

    const second = await service.createSession(USER_ID);
    const after = requireSession(
      await prisma.session.findUnique({ where: { id: firstSession.id } }),
    );
    expect(after.revokedAt).not.toBeNull();
    await expect(service.validateSession(second.sessionToken)).resolves.toBeDefined();
    expect(await prisma.session.count({ where: { revokedAt: null } })).toBe(1);
  });

  it('rotateCsrfToken under concurrency: exactly one winner returns a token', async () => {
    const { sessionToken } = await service.createSession(USER_ID);
    const session = requireSession(
      await prisma.session.findUnique({ where: { tokenHash: storedSessionHash(sessionToken) } }),
    );

    // Both requests observed the same hash during validation; exactly one CAS wins.
    const results = await Promise.allSettled([
      service.rotateCsrfToken(session.id, session.csrfTokenHash),
      service.rotateCsrfToken(session.id, session.csrfTokenHash),
    ]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled');
    const rejected = results.filter((result) => result.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    if (rejected[0] !== undefined && rejected[0].status === 'rejected') {
      expect(rejected[0].reason).toBeInstanceOf(SessionConflictError);
    }

    const after = await prisma.session.findUnique({ where: { id: session.id } });
    if (fulfilled[0] !== undefined && fulfilled[0].status === 'fulfilled') {
      // Only the winner's hash is persisted; the loser returned no token.
      expect(after?.csrfTokenHash).toBe(storedCsrfHash(fulfilled[0].value));
    }
  });

  it('cleanup removes expired and revoked sessions but keeps valid ones', async () => {
    const first = await service.createSession(USER_ID);
    const second = await service.createSession(USER_ID);

    clock.advance(sessionConfig.absoluteTtlMs + 1);
    const removed = await service.cleanupExpired();
    expect(removed).toBe(2);
    expect(await prisma.session.count()).toBe(0);

    await service.createSession(USER_ID);
    expect(await service.cleanupExpired()).toBe(0);

    await expect(service.validateSession(first.sessionToken)).rejects.toBeInstanceOf(
      InvalidSessionError,
    );
    await expect(service.validateSession(second.sessionToken)).rejects.toBeInstanceOf(
      InvalidSessionError,
    );
  });
});
