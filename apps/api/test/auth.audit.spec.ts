import 'reflect-metadata';

import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { PrismaPg } from '@prisma/adapter-pg';
import { Controller, Get, UseGuards } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';

import { AuthGuard } from '../src/auth/auth.guard';
import { CurrentUser } from '../src/auth/current-user.decorator';
import { PasswordService } from '../src/auth/password.service';
import { RequireRoles } from '../src/auth/roles.decorator';
import {
  generateSessionToken,
  storedCsrfHash,
  storedSessionHash,
} from '../src/auth/session/tokens';
import { AppModule } from '../src/app.module';
import { applyApplicationControls, applySecurityMiddleware } from '../src/bootstrap';
import { parseEnvironment } from '../src/config/environment.schema';
import type { Environment } from '../src/config/environment.types';
import { PrismaClient } from '../src/generated/prisma/client';
import { fireConcurrentMeUntilRace, loadTestDatabaseUrl } from './helpers';

const ORIGIN = 'https://app.example.com';
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'a-strong-password-123';
const NEW_PASSWORD = 'a-new-stronger-password-456';
const SESSION_COOKIE = 'leads_session';
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

const argon2Options = { memoryCost: 19_456, timeCost: 2, parallelism: 1, hashLength: 32 };

@Controller('probe')
class AuditProbeController {
  @UseGuards(AuthGuard)
  @Get('secure')
  secure(@CurrentUser() user: { userId: string; role: string; email: string }): {
    userId: string;
    role: string;
    email: string;
  } {
    return { userId: user.userId, role: user.role, email: user.email };
  }

  @UseGuards(AuthGuard)
  @RequireRoles('SUPERADMIN')
  @Get('forbidden-role')
  forbiddenRole(): { ok: true } {
    return { ok: true };
  }
}

let prisma: PrismaClient;
let originalPasswordHash = '';

beforeAll(async () => {
  const url = loadTestDatabaseUrl();
  const adapter = new PrismaPg({ connectionString: url });
  prisma = new PrismaClient({ adapter });
  await prisma.$connect();
  const passwordService = new PasswordService(argon2Options);
  originalPasswordHash = await passwordService.hash(ADMIN_PASSWORD);
  await prisma.user.create({
    data: {
      id: 'u_audit_admin',
      email: ADMIN_EMAIL,
      passwordHash: originalPasswordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      updatedAt: new Date(),
    },
  });
});

afterEach(async () => {
  if (prisma !== undefined) {
    await prisma.session.deleteMany({});
    await prisma.user.updateMany({
      data: { status: 'ACTIVE', passwordHash: originalPasswordHash, passwordChangedAt: null },
    });
  }
});

afterAll(async () => {
  if (prisma !== undefined) {
    await prisma.user.deleteMany({});
    await prisma.$disconnect();
  }
});

const testEnvironment = parseEnvironment({
  NODE_ENV: 'test',
  PORT: '3000',
  CORS_ORIGINS: ORIGIN,
  DATABASE_URL: loadTestDatabaseUrl(),
});

interface TestServer {
  app: INestApplication;
  baseUrl: string;
}

async function startServer(environment: Environment): Promise<TestServer> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register(environment)],
    controllers: [AuditProbeController],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  applySecurityMiddleware(app, environment);
  applyApplicationControls(app);
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  if (address === null || typeof address === 'string') {
    throw new Error('Could not determine the listening port.');
  }
  return { app, baseUrl: `http://127.0.0.1:${address.port}` };
}

function sessionTokenFromSetCookie(setCookie: string | readonly string[] | undefined): string {
  const entries =
    setCookie === undefined ? [] : typeof setCookie === 'string' ? [setCookie] : setCookie;
  const first = entries[0];
  if (first === undefined) {
    throw new Error('Expected a Set-Cookie header.');
  }
  const match = new RegExp(`^${SESSION_COOKIE}=([^;]+)`).exec(first);
  if (match === null || match[1] === undefined) {
    throw new Error(`Expected a ${SESSION_COOKIE} cookie.`);
  }
  return match[1];
}

async function login(
  server: TestServer,
  options: { email?: string; password?: string; origin?: string; referer?: string } = {},
): Promise<request.Response> {
  const headers: Record<string, string> = {};
  if (options.origin !== undefined) {
    headers.Origin = options.origin;
  }
  if (options.referer !== undefined) {
    headers.Referer = options.referer;
  }
  return request(server.baseUrl)
    .post('/auth/login')
    .set(headers)
    .send({ email: options.email ?? ADMIN_EMAIL, password: options.password ?? ADMIN_PASSWORD });
}

async function withSession(server: TestServer): Promise<{ sessionToken: string; csrf: string }> {
  const loginResponse = await login(server, { origin: ORIGIN });
  const sessionToken = sessionTokenFromSetCookie(loginResponse.headers['set-cookie']);
  const me = await request(server.baseUrl)
    .get('/auth/me')
    .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`);
  return { sessionToken, csrf: me.body.csrfToken as string };
}

describe('audit: sessions and /auth/me CSRF (runtime)', () => {
  let currentServer: TestServer | undefined;

  afterEach(async () => {
    await currentServer?.app.close();
    currentServer = undefined;
  });

  it('stores only domain-separated hashes and never the raw session token', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;
    const response = await login(server, { origin: ORIGIN });
    const sessionToken = sessionTokenFromSetCookie(response.headers['set-cookie']);

    const rows = await prisma.session.findMany({});
    expect(rows).toHaveLength(1);
    const row = rows[0];
    if (row === undefined) {
      throw new Error('Expected a session row.');
    }
    expect(row.tokenHash).toBe(storedSessionHash(sessionToken));
    expect(row.tokenHash).not.toContain(sessionToken);
    expect(row.tokenHash).toMatch(/^sess_v1:[0-9a-f]{64}$/);
    expect(row.csrfTokenHash).toMatch(/^csrf_v1:[0-9a-f]{64}$/);
    const me = await request(server.baseUrl)
      .get('/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`);
    expect(me.body.csrfToken).toMatch(TOKEN_PATTERN);
    const afterMe = await prisma.session.findUnique({ where: { id: row.id } });
    // The returned token is a fresh rotation whose HASH is persisted; the raw
    // token is never read back from the database.
    expect(afterMe?.csrfTokenHash).toBe(storedCsrfHash(me.body.csrfToken as string));
    expect(afterMe?.csrfTokenHash).not.toContain(me.body.csrfToken as string);
  });

  it('rotates the CSRF on every /auth/me and the previous token stops working', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;
    const { sessionToken, csrf } = await withSession(server);

    const secondMe = await request(server.baseUrl)
      .get('/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`);
    const rotated = secondMe.body.csrfToken as string;
    expect(rotated).not.toBe(csrf);

    const stale = await request(server.baseUrl)
      .post('/auth/logout')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf);
    expect(stale.status).toBe(403);

    const current = await request(server.baseUrl)
      .post('/auth/logout')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', rotated);
    expect(current.status).toBe(204);
  });

  it('makes concurrent /auth/me rotation deterministic: one 200, one 409 without a token', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;
    const { sessionToken } = await withSession(server);

    const race = await fireConcurrentMeUntilRace(
      server.baseUrl,
      `${SESSION_COOKIE}=${sessionToken}`,
    );
    expect(race.winner.status).toBe(200);
    expect(race.winner.csrfToken).toMatch(TOKEN_PATTERN);
    expect(race.loser.status).toBe(409);
    expect((race.loser.body as { csrfToken?: unknown }).csrfToken).toBeUndefined();
    expect((race.loser.body as { error?: unknown }).error).toBe('CONFLICT');
    expect((race.loser.body as { requestId?: unknown }).requestId).toBeDefined();

    const session = await prisma.session.findFirst({ where: { revokedAt: null } });
    if (session === null) {
      throw new Error('Expected an active session.');
    }
    // Only the winner's hash is persisted; the loser returned no token.
    expect(session.csrfTokenHash).toBe(storedCsrfHash(race.winner.csrfToken));

    const logoutWinner = await request(server.baseUrl)
      .post('/auth/logout')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', race.winner.csrfToken);
    expect(logoutWinner.status).toBe(204);
  });

  it('an unauthorized origin cannot read the /auth/me response via CORS', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;
    const { sessionToken } = await withSession(server);
    const response = await request(server.baseUrl)
      .get('/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
      .set('Origin', 'https://evil.example.com');
    expect(response.status).toBe(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('a losing concurrent login returns no valid token and exactly one active session remains', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;
    const [first, second] = await Promise.all([
      login(server, { origin: ORIGIN }),
      login(server, { origin: ORIGIN }),
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await prisma.session.count({ where: { revokedAt: null } })).toBe(1);

    const tokenA = sessionTokenFromSetCookie(first.headers['set-cookie']);
    const tokenB = sessionTokenFromSetCookie(second.headers['set-cookie']);
    const meA = await request(server.baseUrl)
      .get('/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${tokenA}`);
    const meB = await request(server.baseUrl)
      .get('/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${tokenB}`);
    const statuses = [meA.status, meB.status].sort();
    expect(statuses).toEqual([200, 401]);
    // The revoked cookie never authenticates; no raw token exists in the DB.
    const rawCount = await prisma.session.count({
      where: {
        OR: [{ tokenHash: { in: [tokenA, tokenB] } }, { csrfTokenHash: { in: [tokenA, tokenB] } }],
      },
    });
    expect(rawCount).toBe(0);
  });
});

describe('audit: login enumeration and timing (runtime)', () => {
  let currentServer: TestServer | undefined;

  afterEach(async () => {
    await currentServer?.app.close();
    currentServer = undefined;
  });

  async function timeLogin(
    server: TestServer,
    options: { email?: string; password?: string } = {},
    samples = 3,
  ): Promise<number[]> {
    const durations: number[] = [];
    for (let i = 0; i < samples; i += 1) {
      const started = performance.now();
      const response = await request(server.baseUrl)
        .post('/auth/login')
        .set('Origin', ORIGIN)
        .send({
          email: options.email ?? ADMIN_EMAIL,
          password: options.password ?? ADMIN_PASSWORD,
        });
      expect(response.status).toBe(401);
      durations.push(performance.now() - started);
    }
    return durations;
  }

  it('returns an identical uniform 401 for unknown e-mail, inactive user and wrong password', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;

    const unknown = await login(server, { origin: ORIGIN, email: 'missing@example.com' });
    const wrong = await login(server, { origin: ORIGIN, password: 'wrong-password-123' });

    await prisma.user.update({ where: { email: ADMIN_EMAIL }, data: { status: 'INACTIVE' } });
    const inactive = await login(server, { origin: ORIGIN });

    for (const response of [unknown, wrong, inactive]) {
      expect(response.status).toBe(401);
      expect(response.body.statusCode).toBe(401);
      expect(response.body.error).toBe('UNAUTHORIZED');
      expect(response.body.message).toBe('Authentication is required.');
      expect(response.headers['set-cookie']).toBeUndefined();
    }
  });

  it('measures login failure durations across conditions and reports them', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;

    const unknownMs = await timeLogin(server, { email: 'missing@example.com' });
    const wrongMs = await timeLogin(server, { password: 'wrong-password-123' });

    await prisma.user.update({ where: { email: ADMIN_EMAIL }, data: { status: 'INACTIVE' } });
    const inactiveMs = await timeLogin(server);

    const median = (values: number[]): number =>
      [...values].sort((x, y) => x - y)[Math.floor(values.length / 2)] ?? 0;
    const unknownMedian = median(unknownMs);
    const wrongMedian = median(wrongMs);
    const inactiveMedian = median(inactiveMs);

    process.stdout.write(
      `\n[AUDIT][timing] unknownEmail median=${unknownMedian.toFixed(1)}ms ` +
        `wrongPassword median=${wrongMedian.toFixed(1)}ms ` +
        `inactiveUser median=${inactiveMedian.toFixed(1)}ms\n`,
    );

    // The dummy Argon2id verify equalizes the timing signal: unknown e-mail and
    // inactive users run the same verify as a wrong password. Loose bound so the
    // assertion is not fragile — the structural gate (exactly one verify) lives
    // in auth.service.spec.ts.
    expect(unknownMedian).toBeGreaterThan(wrongMedian * 0.5);
    expect(inactiveMedian).toBeGreaterThan(wrongMedian * 0.5);
  });
});

describe('audit: login input handling (runtime)', () => {
  let currentServer: TestServer | undefined;

  afterEach(async () => {
    await currentServer?.app.close();
    currentServer = undefined;
  });

  it('a short technically-valid password yields the uniform 401', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;
    const response = await login(server, { origin: ORIGIN, password: 'short' });
    expect(response.status).toBe(401);
    expect(response.body.error).toBe('UNAUTHORIZED');
  });

  it('rejects invalid payloads and unknown properties with 400', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;

    const invalid = await request(server.baseUrl).post('/auth/login').set('Origin', ORIGIN).send({
      email: 'not-an-email',
      password: ADMIN_PASSWORD,
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.error).toBe('VALIDATION_ERROR');

    const extra = await request(server.baseUrl).post('/auth/login').set('Origin', ORIGIN).send({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      role: 'SUPERADMIN',
      userId: 'attacker',
    });
    expect(extra.status).toBe(400);
    expect(extra.body.error).toBe('VALIDATION_ERROR');
  });

  it('rejects login without an Origin header and with the literal null origin', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;

    const noOrigin = await login(server);
    expect(noOrigin.status).toBe(403);
    expect(noOrigin.body.error).toBe('FORBIDDEN');
    expect(noOrigin.headers['set-cookie']).toBeUndefined();

    const nullOrigin = await login(server, { origin: 'null' });
    expect(nullOrigin.status).toBe(403);
    expect(nullOrigin.body.error).toBe('FORBIDDEN');
  });

  it('rejects an invalid Origin and an invalid Referer', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;

    const badOrigin = await login(server, { origin: 'https://evil.example.com' });
    expect(badOrigin.status).toBe(403);
    expect(badOrigin.body.error).toBe('FORBIDDEN');

    const badReferer = await login(server, {
      origin: ORIGIN,
      referer: 'https://other.example.com/page',
    });
    expect(badReferer.status).toBe(403);
    expect(badReferer.body.error).toBe('FORBIDDEN');
  });

  it('rate limits login to 10 per window with a controlled 429', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      const response = await login(server, { origin: ORIGIN, password: 'wrong-password-123' });
      statuses.push(response.status);
    }
    expect(statuses[0]).toBe(401);
    expect(statuses[10]).toBe(429);
    const last = await login(server, { origin: ORIGIN, password: 'wrong-password-123' });
    expect(last.body.error).toBe('RATE_LIMIT_EXCEEDED');
    expect(last.headers['x-ratelimit-limit']).toBeUndefined();
  });
});

describe('audit: cookie attributes per environment (runtime, test env)', () => {
  let currentServer: TestServer | undefined;

  afterEach(async () => {
    await currentServer?.app.close();
    currentServer = undefined;
  });

  it('emits leads_session HttpOnly/SameSite=Strict/Path=/ without Domain and without Secure', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;
    const response = await login(server, { origin: ORIGIN });
    const setCookie = response.headers['set-cookie'];
    expect(setCookie).toBeDefined();
    const header = (setCookie ?? [])[0] ?? '';
    expect(header).toMatch(new RegExp(`^${SESSION_COOKIE}=`));
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=Strict/i);
    expect(header).toMatch(/Path=\//i);
    expect(header).not.toMatch(/Domain=/i);
    expect(header).not.toMatch(/Secure/i);
  });

  it('ignores a cookie whose name belongs to another environment', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;
    const loginResponse = await login(server, { origin: ORIGIN });
    const sessionToken = sessionTokenFromSetCookie(loginResponse.headers['set-cookie']);

    const me = await request(server.baseUrl)
      .get('/auth/me')
      .set('Cookie', `__Host-leads_session=${'a'.repeat(64)}; ${SESSION_COOKIE}=${sessionToken}`);
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe(ADMIN_EMAIL);

    const onlyOther = await request(server.baseUrl)
      .get('/auth/me')
      .set('Cookie', `__Host-leads_session=${sessionToken}`);
    expect(onlyOther.status).toBe(401);
  });

  it('logout clears the cookie with coherent attributes', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;
    const { sessionToken, csrf } = await withSession(server);
    const logout = await request(server.baseUrl)
      .post('/auth/logout')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf);
    expect(logout.status).toBe(204);
    const clear = (logout.headers['set-cookie'] ?? [])[0] ?? '';
    expect(clear).toMatch(new RegExp(`^${SESSION_COOKIE}=`));
    expect(clear).toMatch(/Expires=Thu, 01 Jan 1970/i);
    expect(clear).toMatch(/Path=\//i);
  });

  it('never emits a cookie on failed login and never before the commit', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;
    const failed = await login(server, { origin: ORIGIN, password: 'wrong-password-123' });
    expect(failed.status).toBe(401);
    expect(failed.headers['set-cookie']).toBeUndefined();

    const ok = await login(server, { origin: ORIGIN });
    expect(ok.status).toBe(200);
    expect(ok.headers['set-cookie']).toBeDefined();
    const bodyText = JSON.stringify(ok.body);
    expect(bodyText).not.toContain(sessionTokenFromSetCookie(ok.headers['set-cookie']));
  });
});

describe('audit: CSRF and CORS matrix (runtime)', () => {
  let currentServer: TestServer | undefined;

  afterEach(async () => {
    await currentServer?.app.close();
    currentServer = undefined;
  });

  it('rejects protected mutations without CSRF, with wrong CSRF, and with a stale CSRF', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;
    const { sessionToken, csrf } = await withSession(server);

    const noCsrf = await request(server.baseUrl)
      .post('/auth/logout')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
      .set('Origin', ORIGIN);
    expect(noCsrf.status).toBe(403);

    const wrongCsrf = await request(server.baseUrl)
      .post('/auth/logout')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', 'a'.repeat(64));
    expect(wrongCsrf.status).toBe(403);

    const rotated = await request(server.baseUrl)
      .get('/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`);
    const stale = await request(server.baseUrl)
      .post('/auth/logout')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf);
    expect(rotated.status).toBe(200);
    expect(stale.status).toBe(403);
  });

  it('rejects a CSRF token belonging to another session', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;
    const { sessionToken } = await withSession(server);
    const otherCsrf = 'b'.repeat(64);
    await prisma.session.create({
      data: {
        userId: 'u_audit_admin',
        tokenHash: storedSessionHash(generateSessionToken()),
        csrfTokenHash: storedCsrfHash(otherCsrf),
        expiresAt: new Date(Date.now() + 60_000),
        lastUsedAt: new Date(),
        revokedAt: new Date(),
      },
    });
    const logout = await request(server.baseUrl)
      .post('/auth/logout')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', otherCsrf);
    expect(logout.status).toBe(403);
  });

  it('rejects protected mutations without an Origin even when a valid CSRF is present', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;
    const { sessionToken, csrf } = await withSession(server);

    // Authentication mutations require an exact Origin; a missing Origin is 403
    // regardless of the CSRF token (Origin is never substituted by Referer).
    const noCsrf = await request(server.baseUrl)
      .post('/auth/logout')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`);
    expect(noCsrf.status).toBe(403);

    const withCsrf = await request(server.baseUrl)
      .post('/auth/logout')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
      .set('X-CSRF-Token', csrf);
    expect(withCsrf.status).toBe(403);
  });

  it('keeps GET /auth/me and GET /health working without an Origin (read endpoints)', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;
    const { sessionToken } = await withSession(server);

    const me = await request(server.baseUrl)
      .get('/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`);
    expect(me.status).toBe(200);
    expect(me.body.csrfToken).toMatch(TOKEN_PATTERN);

    const health = await request(server.baseUrl).get('/health');
    expect(health.status).toBe(200);
  });

  it('grants credentialed CORS and X-CSRF-Token only to the exact authorized origin', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;

    const ok = await request(server.baseUrl)
      .options('/auth/login')
      .set('Origin', ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'X-CSRF-Token');
    expect(ok.status).toBe(204);
    expect(ok.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(ok.headers['access-control-allow-credentials']).toBe('true');
    expect(ok.headers['access-control-allow-headers']).toContain('X-CSRF-Token');
    expect(ok.headers['access-control-allow-origin']).not.toBe('*');

    const evil = await request(server.baseUrl)
      .options('/auth/login')
      .set('Origin', 'https://app.example.com.evil.com')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'X-CSRF-Token');
    expect(evil.headers['access-control-allow-origin']).toBeUndefined();
    expect(evil.headers['access-control-allow-credentials']).toBeUndefined();
    expect(evil.headers['access-control-allow-headers']).toBeUndefined();
  });
});

describe('audit: change-password (runtime)', () => {
  let currentServer: TestServer | undefined;

  afterEach(async () => {
    await currentServer?.app.close();
    currentServer = undefined;
  });

  it('rejects an excessive-byte new password and preserves password without normalization', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;
    const { sessionToken, csrf } = await withSession(server);

    const tooManyBytes = await request(server.baseUrl)
      .post('/auth/change-password')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ currentPassword: ADMIN_PASSWORD, newPassword: 'á'.repeat(200) });
    expect(tooManyBytes.status).toBe(400);
    expect(tooManyBytes.body.error).toBe('VALIDATION_ERROR');

    const paddedPassword = await login(server, {
      origin: ORIGIN,
      password: `  ${ADMIN_PASSWORD}  `,
    });
    expect(paddedPassword.status).toBe(401);
  });

  it('rolls back completely when the current password is wrong', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;
    const { sessionToken, csrf } = await withSession(server);

    const failed = await request(server.baseUrl)
      .post('/auth/change-password')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ currentPassword: 'wrong-current-password', newPassword: NEW_PASSWORD });
    expect(failed.status).toBe(401);
    expect(failed.headers['set-cookie']).toBeUndefined();

    const user = await prisma.user.findUnique({ where: { id: 'u_audit_admin' } });
    expect(user?.passwordHash).toBe(originalPasswordHash);
    expect(user?.passwordChangedAt).toBeNull();
    expect(await prisma.session.count({ where: { revokedAt: null } })).toBe(1);

    const stillWorks = await login(server, { origin: ORIGIN, password: ADMIN_PASSWORD });
    expect(stillWorks.status).toBe(200);
  });

  it('updates passwordChangedAt, revokes old sessions and keeps/rotates the current one', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;
    const { sessionToken, csrf } = await withSession(server);

    const before = await prisma.user.findUnique({ where: { id: 'u_audit_admin' } });
    const changed = await request(server.baseUrl)
      .post('/auth/change-password')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ currentPassword: ADMIN_PASSWORD, newPassword: NEW_PASSWORD });
    expect(changed.status).toBe(200);
    expect(changed.body.csrfToken).toMatch(TOKEN_PATTERN);
    expect(changed.headers['cache-control']).toContain('no-store');
    const newToken = sessionTokenFromSetCookie(changed.headers['set-cookie']);
    expect(newToken).not.toBe(sessionToken);

    const after = await prisma.user.findUnique({ where: { id: 'u_audit_admin' } });
    expect(after?.passwordChangedAt).not.toBeNull();
    expect(before?.passwordChangedAt).toBeNull();
    expect(await prisma.session.count({ where: { revokedAt: null } })).toBe(1);

    const oldMe = await request(server.baseUrl)
      .get('/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`);
    expect(oldMe.status).toBe(401);

    const newMe = await request(server.baseUrl)
      .get('/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${newToken}`);
    expect(newMe.status).toBe(200);

    const oldPasswordLogin = await login(server, { origin: ORIGIN, password: ADMIN_PASSWORD });
    expect(oldPasswordLogin.status).toBe(401);
  });

  it('rehashes the stored hash on a successful login with outdated parameters', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;
    const rehashService = new PasswordService({
      memoryCost: 19_456,
      timeCost: 3,
      parallelism: 1,
      hashLength: 32,
    });
    const legacyHash = await rehashService.hash(ADMIN_PASSWORD);
    await prisma.user.update({
      where: { id: 'u_audit_admin' },
      data: { passwordHash: legacyHash },
    });

    const response = await login(server, { origin: ORIGIN });
    expect(response.status).toBe(200);
    const stored = await prisma.user.findUnique({ where: { id: 'u_audit_admin' } });
    expect(stored?.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2/);
    expect(stored?.passwordHash).not.toContain('t=3');
  });

  it('handles a change-password racing another authenticated request safely', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;
    const { sessionToken, csrf } = await withSession(server);

    const [changeResult, meResult] = await Promise.allSettled([
      request(server.baseUrl)
        .post('/auth/change-password')
        .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
        .set('Origin', ORIGIN)
        .set('X-CSRF-Token', csrf)
        .send({ currentPassword: ADMIN_PASSWORD, newPassword: NEW_PASSWORD }),
      request(server.baseUrl).get('/auth/me').set('Cookie', `${SESSION_COOKIE}=${sessionToken}`),
    ]);

    if (changeResult.status === 'fulfilled') {
      expect(changeResult.value.status).toBeGreaterThanOrEqual(200);
      expect(changeResult.value.status).toBeLessThan(500);
    }
    if (meResult.status === 'fulfilled') {
      expect([200, 401]).toContain(meResult.value.status);
    }
    expect(await prisma.session.count({ where: { revokedAt: null } })).toBeLessThanOrEqual(1);
    expect(await prisma.user.count({ where: { id: 'u_audit_admin' } })).toBe(1);
  });
});

describe('audit: authorization (runtime)', () => {
  let currentServer: TestServer | undefined;

  afterEach(async () => {
    await currentServer?.app.close();
    currentServer = undefined;
  });

  it('keeps /health public and denies private routes with 401/403', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;

    const health = await request(server.baseUrl).get('/health');
    expect(health.status).toBe(200);

    const noSession = await request(server.baseUrl).get('/probe/secure');
    expect(noSession.status).toBe(401);
    expect(noSession.body.error).toBe('UNAUTHORIZED');

    const { sessionToken } = await withSession(server);
    const allowed = await request(server.baseUrl)
      .get('/probe/secure')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`);
    expect(allowed.status).toBe(200);
    expect(allowed.body.userId).toBe('u_audit_admin');

    const forbidden = await request(server.baseUrl)
      .get('/probe/forbidden-role')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error).toBe('FORBIDDEN');
  });

  it('denies access to an inactive user and ignores client-supplied identity', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;
    const { sessionToken } = await withSession(server);

    await prisma.user.update({ where: { id: 'u_audit_admin' }, data: { status: 'INACTIVE' } });
    const denied = await request(server.baseUrl)
      .get('/probe/secure')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`);
    expect(denied.status).toBe(401);

    await prisma.user.update({ where: { id: 'u_audit_admin' }, data: { status: 'ACTIVE' } });
    const spoofed = await request(server.baseUrl)
      .get('/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
      .set('X-User-Id', 'attacker')
      .set('X-Role', 'SUPERADMIN')
      .set('X-Owner-Id', 'attacker');
    expect(spoofed.status).toBe(200);
    expect(spoofed.body.user.id).toBe('u_audit_admin');
    expect(spoofed.body.user.role).toBe('ADMIN');
  });

  it('the authenticated principal never contains hashes, tokens or raw models', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;
    const { sessionToken } = await withSession(server);
    const response = await request(server.baseUrl)
      .get('/probe/secure')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`);
    const body = JSON.stringify(response.body);
    expect(body).not.toContain('passwordHash');
    expect(body).not.toContain('tokenHash');
    expect(body).not.toContain('csrfTokenHash');
    expect(body).not.toContain('createdAt');
  });
});
