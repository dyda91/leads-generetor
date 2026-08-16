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
import type { SafePrincipal } from '../src/auth/session/session.types';
import { AppModule } from '../src/app.module';
import { applyApplicationControls, applySecurityMiddleware } from '../src/bootstrap';
import { parseEnvironment } from '../src/config/environment.schema';
import type { Environment } from '../src/config/environment.types';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  generateSessionToken,
  storedCsrfHash,
  storedSessionHash,
} from '../src/auth/session/tokens';
import { fireConcurrentMeUntilRace, loadTestDatabaseUrl } from './helpers';

const ORIGIN = 'https://app.example.com';
const ADMIN_EMAIL = 'admin@example.com';
const ADMIN_PASSWORD = 'a-strong-password-123';
const SESSION_COOKIE = 'leads_session';
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const NEW_PASSWORD = 'a-new-stronger-password-456';

const argon2Options = { memoryCost: 19_456, timeCost: 2, parallelism: 1, hashLength: 32 };

@Controller('probe')
class AuthProbeController {
  @UseGuards(AuthGuard)
  @Get('secure')
  secure(@CurrentUser() user: SafePrincipal): { userId: string; role: string } {
    return { userId: user.userId, role: user.role };
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
      id: 'u_auth_test',
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
    controllers: [AuthProbeController],
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

describe('authentication surface (isolated test database)', () => {
  let currentServer: TestServer | undefined;

  afterEach(async () => {
    await currentServer?.app.close();
    currentServer = undefined;
  });

  it('logs in and returns the user and CSRF token in the body, never the session token', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;

    const response = await login(server, { origin: ORIGIN });
    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({
      id: 'u_auth_test',
      email: ADMIN_EMAIL,
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    expect(response.body.csrfToken).toMatch(TOKEN_PATTERN);
    expect(response.body).not.toHaveProperty('passwordHash');
    expect(response.body).not.toHaveProperty('sessionToken');
    expect(response.body).not.toHaveProperty('token');
    expect(response.headers['cache-control']).toContain('no-store');

    const setCookie = response.headers['set-cookie'];
    const sessionToken = sessionTokenFromSetCookie(setCookie);
    expect(sessionToken).toMatch(TOKEN_PATTERN);
    const cookieHeader = setCookie?.[0] ?? '';
    expect(cookieHeader).toMatch(/HttpOnly/i);
    expect(cookieHeader).toMatch(/SameSite=Strict/i);
    expect(cookieHeader).toMatch(/Max-Age=/i);
  });

  it('rejects a wrong password, an unknown e-mail and an inactive user uniformly', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;

    const wrongPassword = await login(server, { origin: ORIGIN, password: 'wrong-password-123' });
    const unknownEmail = await login(server, { origin: ORIGIN, email: 'missing@example.com' });

    await prisma.user.update({ where: { email: ADMIN_EMAIL }, data: { status: 'INACTIVE' } });
    const inactive = await login(server, { origin: ORIGIN });

    for (const response of [wrongPassword, unknownEmail, inactive]) {
      expect(response.status).toBe(401);
      expect(response.body.error).toBe('UNAUTHORIZED');
      expect(response.body.message).toBe('Authentication is required.');
      expect(response.headers['set-cookie']).toBeUndefined();
    }
  });

  it('rejects login from a disallowed origin and from disagreeing headers', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;

    const disallowed = await login(server, { origin: 'https://evil.example.com' });
    expect(disallowed.status).toBe(403);
    expect(disallowed.body.error).toBe('FORBIDDEN');

    const mismatch = await login(server, {
      origin: ORIGIN,
      referer: 'https://other.example.com/page',
    });
    expect(mismatch.status).toBe(403);
    expect(mismatch.body.error).toBe('FORBIDDEN');
  });

  it('rejects login without an Origin header', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;
    const response = await login(server);
    expect(response.status).toBe(403);
    expect(response.body.error).toBe('FORBIDDEN');
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('keeps a single active session: the second login invalidates the first cookie', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;

    const first = await login(server, { origin: ORIGIN });
    const firstToken = sessionTokenFromSetCookie(first.headers['set-cookie']);

    const second = await login(server, { origin: ORIGIN });
    const secondToken = sessionTokenFromSetCookie(second.headers['set-cookie']);
    expect(secondToken).not.toBe(firstToken);

    const staleMe = await request(server.baseUrl)
      .get('/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${firstToken}`);
    expect(staleMe.status).toBe(401);

    const currentMe = await request(server.baseUrl)
      .get('/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${secondToken}`);
    expect(currentMe.status).toBe(200);
  });

  it('me requires a valid session cookie', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;

    const noCookie = await request(server.baseUrl).get('/auth/me');
    expect(noCookie.status).toBe(401);
    expect(noCookie.body.error).toBe('UNAUTHORIZED');

    const garbage = await request(server.baseUrl)
      .get('/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=not-a-real-token`);
    expect(garbage.status).toBe(401);

    const otherEnv = await request(server.baseUrl)
      .get('/auth/me')
      .set('Cookie', '__Host-leads_session=not-a-real-token');
    expect(otherEnv.status).toBe(401);
  });

  it('me returns the user and a fresh CSRF token without leaking secrets', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;

    const loginResponse = await login(server, { origin: ORIGIN });
    const sessionToken = sessionTokenFromSetCookie(loginResponse.headers['set-cookie']);

    const response = await request(server.baseUrl)
      .get('/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`);
    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({
      id: 'u_auth_test',
      email: ADMIN_EMAIL,
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    expect(response.body.csrfToken).toMatch(TOKEN_PATTERN);
    expect(response.body).not.toHaveProperty('passwordHash');
    expect(response.body).not.toHaveProperty('sessionToken');
    expect(response.headers['cache-control']).toContain('no-store');
  });

  it('me rotates the CSRF token so the previous one becomes stale', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;

    const loginResponse = await login(server, { origin: ORIGIN });
    const firstCsrf = loginResponse.body.csrfToken as string;
    const sessionToken = sessionTokenFromSetCookie(loginResponse.headers['set-cookie']);

    const meResponse = await request(server.baseUrl)
      .get('/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`);
    const secondCsrf = meResponse.body.csrfToken as string;
    expect(secondCsrf).not.toBe(firstCsrf);

    const withStale = await request(server.baseUrl)
      .post('/auth/logout')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', firstCsrf);
    expect(withStale.status).toBe(403);

    const withCurrent = await request(server.baseUrl)
      .post('/auth/logout')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', secondCsrf);
    expect(withCurrent.status).toBe(204);
  });

  it('logout requires a session, an allowed origin and a valid CSRF token', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;

    const noSession = await request(server.baseUrl).post('/auth/logout');
    expect(noSession.status).toBe(401);

    const loginResponse = await login(server, { origin: ORIGIN });
    const sessionToken = sessionTokenFromSetCookie(loginResponse.headers['set-cookie']);
    const meResponse = await request(server.baseUrl)
      .get('/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`);
    const csrf = meResponse.body.csrfToken as string;

    const noOrigin = await request(server.baseUrl)
      .post('/auth/logout')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
      .set('X-CSRF-Token', csrf)
      .set('Origin', 'https://evil.example.com');
    expect(noOrigin.status).toBe(403);

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
  });

  it('logout revokes the session, clears the cookie and later me is 401', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;

    const loginResponse = await login(server, { origin: ORIGIN });
    const sessionToken = sessionTokenFromSetCookie(loginResponse.headers['set-cookie']);
    const meResponse = await request(server.baseUrl)
      .get('/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`);
    const csrf = meResponse.body.csrfToken as string;

    const logout = await request(server.baseUrl)
      .post('/auth/logout')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf);
    expect(logout.status).toBe(204);
    const clearCookie = (logout.headers['set-cookie'] ?? [])[0] ?? '';
    expect(clearCookie).toMatch(/leads_session=/);
    expect(clearCookie).toMatch(/Expires=Thu, 01 Jan 1970/i);

    const after = await request(server.baseUrl)
      .get('/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`);
    expect(after.status).toBe(401);
  });

  it('me returns 401 for a revoked session', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;

    const loginResponse = await login(server, { origin: ORIGIN });
    const sessionToken = sessionTokenFromSetCookie(loginResponse.headers['set-cookie']);

    await prisma.session.updateMany({ data: { revokedAt: new Date() } });

    const response = await request(server.baseUrl)
      .get('/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`);
    expect(response.status).toBe(401);
  });

  it('rate limits login strictly without exposing internal counters', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;

    const statuses: number[] = [];
    for (let index = 0; index < 11; index += 1) {
      const response = await login(server, { origin: ORIGIN, password: 'wrong-password-123' });
      statuses.push(response.status);
    }

    expect(statuses[0]).toBe(401);
    expect(statuses[10]).toBe(429);
    const last = await login(server, { origin: ORIGIN, password: 'wrong-password-123' });
    expect(last.body.error).toBe('RATE_LIMIT_EXCEEDED');
    expect(last.headers['x-ratelimit-limit']).toBeUndefined();
  });

  it('denies a private route without a session (401) and without permission (403)', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;

    const noSession = await request(server.baseUrl).get('/probe/secure');
    expect(noSession.status).toBe(401);
    expect(noSession.body.error).toBe('UNAUTHORIZED');

    const loginResponse = await login(server, { origin: ORIGIN });
    const sessionToken = sessionTokenFromSetCookie(loginResponse.headers['set-cookie']);

    const allowed = await request(server.baseUrl)
      .get('/probe/secure')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`);
    expect(allowed.status).toBe(200);
    expect(allowed.body).toEqual({ userId: 'u_auth_test', role: 'ADMIN' });

    const forbidden = await request(server.baseUrl)
      .get('/probe/forbidden-role')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`);
    expect(forbidden.status).toBe(403);
    expect(forbidden.body.error).toBe('FORBIDDEN');
    expect(forbidden.body).not.toHaveProperty('stack');
  });

  it('never trusts client-supplied identity', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;

    const loginResponse = await login(server, { origin: ORIGIN });
    const sessionToken = sessionTokenFromSetCookie(loginResponse.headers['set-cookie']);

    const response = await request(server.baseUrl)
      .get('/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
      .set('X-User-Id', 'attacker-controlled')
      .set('X-Role', 'SUPERADMIN')
      .set('X-Owner-Id', 'attacker-controlled');
    expect(response.status).toBe(200);
    expect(response.body.user.id).toBe('u_auth_test');
    expect(response.body.user.role).toBe('ADMIN');
  });

  it('keeps /health public and unknown /auth routes on the 404 contract', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;

    const health = await request(server.baseUrl).get('/health');
    expect(health.status).toBe(200);

    const unknown = await request(server.baseUrl).get('/auth/does-not-exist');
    expect(unknown.status).toBe(404);
    expect(unknown.body.error).toBe('NOT_FOUND');
  });

  it('grants credentialed CORS and the CSRF header only to exact authorized origins', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;

    const credentials = await request(server.baseUrl).get('/health').set('Origin', ORIGIN);
    expect(credentials.headers['access-control-allow-credentials']).toBe('true');
    expect(credentials.headers['access-control-allow-origin']).toBe(ORIGIN);

    const allowedPreflight = await request(server.baseUrl)
      .options('/auth/login')
      .set('Origin', ORIGIN)
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'X-CSRF-Token');
    expect(allowedPreflight.status).toBe(204);
    expect(allowedPreflight.headers['access-control-allow-origin']).toBe(ORIGIN);
    expect(allowedPreflight.headers['access-control-allow-headers']).toContain('X-CSRF-Token');

    const evilPreflight = await request(server.baseUrl)
      .options('/auth/login')
      .set('Origin', 'https://evil.example.com')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'X-CSRF-Token');
    expect(evilPreflight.headers['access-control-allow-origin']).toBeUndefined();
    expect(evilPreflight.headers['access-control-allow-credentials']).toBeUndefined();
    expect(evilPreflight.headers['access-control-allow-headers']).toBeUndefined();
  });

  it('rejects a CSRF token that belongs to another session', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;

    const loginResponse = await login(server, { origin: ORIGIN });
    const sessionToken = sessionTokenFromSetCookie(loginResponse.headers['set-cookie']);

    const otherCsrf = 'b'.repeat(64);
    await prisma.session.create({
      data: {
        userId: 'u_auth_test',
        tokenHash: storedSessionHash(generateSessionToken()),
        csrfTokenHash: storedCsrfHash(otherCsrf),
        expiresAt: new Date(Date.now() + 60_000),
        lastUsedAt: new Date(),
        revokedAt: new Date(),
      },
    });

    const crossSession = await request(server.baseUrl)
      .post('/auth/logout')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', otherCsrf);
    expect(crossSession.status).toBe(403);
    expect(crossSession.body.error).toBe('FORBIDDEN');
  });

  it('makes concurrent /auth/me CSRF rotation deterministic: one 200, one 409', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;

    const loginResponse = await login(server, { origin: ORIGIN });
    const sessionToken = sessionTokenFromSetCookie(loginResponse.headers['set-cookie']);

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

    const me = await request(server.baseUrl)
      .get('/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`);
    const currentCsrf = me.body.csrfToken as string;

    const withWinner = await request(server.baseUrl)
      .post('/auth/logout')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', race.winner.csrfToken);
    if (withWinner.status !== 204) {
      expect(withWinner.status).toBe(403);
      // The latest /me rotation is always valid regardless of the race winner.
      const withCurrent = await request(server.baseUrl)
        .post('/auth/logout')
        .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
        .set('Origin', ORIGIN)
        .set('X-CSRF-Token', currentCsrf);
      expect(withCurrent.status).toBe(204);
    } else {
      expect(withWinner.status).toBe(204);
    }
  });

  it('change-password rotates the session, revokes old sessions and keeps the admin signed in', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;

    const loginResponse = await login(server, { origin: ORIGIN });
    const oldToken = sessionTokenFromSetCookie(loginResponse.headers['set-cookie']);
    const meResponse = await request(server.baseUrl)
      .get('/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${oldToken}`);
    const csrf = meResponse.body.csrfToken as string;

    const change = await request(server.baseUrl)
      .post('/auth/change-password')
      .set('Cookie', `${SESSION_COOKIE}=${oldToken}`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ currentPassword: ADMIN_PASSWORD, newPassword: NEW_PASSWORD });
    expect(change.status).toBe(200);
    expect(change.body.user).toEqual({
      id: 'u_auth_test',
      email: ADMIN_EMAIL,
      role: 'ADMIN',
      status: 'ACTIVE',
    });
    expect(change.body.csrfToken).toMatch(TOKEN_PATTERN);
    expect(change.body).not.toHaveProperty('passwordHash');
    expect(change.headers['cache-control']).toContain('no-store');
    const newToken = sessionTokenFromSetCookie(change.headers['set-cookie']);
    expect(newToken).not.toBe(oldToken);

    const oldMe = await request(server.baseUrl)
      .get('/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${oldToken}`);
    expect(oldMe.status).toBe(401);

    const newMe = await request(server.baseUrl)
      .get('/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${newToken}`);
    expect(newMe.status).toBe(200);

    const oldPasswordLogin = await login(server, { origin: ORIGIN, password: ADMIN_PASSWORD });
    expect(oldPasswordLogin.status).toBe(401);
    const newPasswordLogin = await login(server, { origin: ORIGIN, password: NEW_PASSWORD });
    expect(newPasswordLogin.status).toBe(200);
  });

  it('change-password rejects a wrong current password uniformly and changes nothing', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;

    const loginResponse = await login(server, { origin: ORIGIN });
    const sessionToken = sessionTokenFromSetCookie(loginResponse.headers['set-cookie']);
    const meResponse = await request(server.baseUrl)
      .get('/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`);
    const csrf = meResponse.body.csrfToken as string;

    const change = await request(server.baseUrl)
      .post('/auth/change-password')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ currentPassword: 'wrong-current-password', newPassword: NEW_PASSWORD });
    expect(change.status).toBe(401);
    expect(change.body.error).toBe('UNAUTHORIZED');
    expect(change.headers['set-cookie']).toBeUndefined();

    const stillValid = await login(server, { origin: ORIGIN, password: ADMIN_PASSWORD });
    expect(stillValid.status).toBe(200);
  });

  it('change-password validates the new password policy', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;

    const loginResponse = await login(server, { origin: ORIGIN });
    const sessionToken = sessionTokenFromSetCookie(loginResponse.headers['set-cookie']);
    const meResponse = await request(server.baseUrl)
      .get('/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`);
    const csrf = meResponse.body.csrfToken as string;

    const short = await request(server.baseUrl)
      .post('/auth/change-password')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ currentPassword: ADMIN_PASSWORD, newPassword: 'short' });
    expect(short.status).toBe(400);
    expect(short.body.error).toBe('VALIDATION_ERROR');

    const missing = await request(server.baseUrl)
      .post('/auth/change-password')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send({ currentPassword: ADMIN_PASSWORD });
    expect(missing.status).toBe(400);
  });

  it('change-password requires session, origin and CSRF', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;

    const loginResponse = await login(server, { origin: ORIGIN });
    const sessionToken = sessionTokenFromSetCookie(loginResponse.headers['set-cookie']);
    const meResponse = await request(server.baseUrl)
      .get('/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`);
    const csrf = meResponse.body.csrfToken as string;
    const body = { currentPassword: ADMIN_PASSWORD, newPassword: NEW_PASSWORD };

    const noCsrf = await request(server.baseUrl)
      .post('/auth/change-password')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
      .set('Origin', ORIGIN)
      .send(body);
    expect(noCsrf.status).toBe(403);

    const badOrigin = await request(server.baseUrl)
      .post('/auth/change-password')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`)
      .set('Origin', 'https://evil.example.com')
      .set('X-CSRF-Token', csrf)
      .send(body);
    expect(badOrigin.status).toBe(403);

    const noSession = await request(server.baseUrl)
      .post('/auth/change-password')
      .set('Origin', ORIGIN)
      .set('X-CSRF-Token', csrf)
      .send(body);
    expect(noSession.status).toBe(401);
  });

  it('two simultaneous logins leave exactly one active session and one valid cookie', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;

    const [first, second] = await Promise.all([
      login(server, { origin: ORIGIN }),
      login(server, { origin: ORIGIN }),
    ]);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await prisma.session.count({ where: { revokedAt: null } })).toBe(1);

    const firstToken = sessionTokenFromSetCookie(first.headers['set-cookie']);
    const secondToken = sessionTokenFromSetCookie(second.headers['set-cookie']);
    const firstMe = await request(server.baseUrl)
      .get('/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${firstToken}`);
    const secondMe = await request(server.baseUrl)
      .get('/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${secondToken}`);
    const statuses = [firstMe.status, secondMe.status].sort();
    expect(statuses).toEqual([200, 401]);
  });

  it('rehashes transparently on login when the stored Argon2 parameters differ', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;

    const rehashService = new PasswordService({
      memoryCost: 19_456,
      timeCost: 3,
      parallelism: 1,
      hashLength: 32,
    });
    const legacyHash = await rehashService.hash(ADMIN_PASSWORD);
    await prisma.user.update({ where: { email: ADMIN_EMAIL }, data: { passwordHash: legacyHash } });

    const response = await login(server, { origin: ORIGIN });
    expect(response.status).toBe(200);

    const stored = await prisma.user.findUnique({ where: { email: ADMIN_EMAIL } });
    expect(stored?.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,p=1,t=2/);
    expect(stored?.passwordHash).not.toContain('t=3');
  });

  it('returns a generic 500 when the database is unavailable but /health stays up', async () => {
    const failingPrisma = {
      user: {
        findUnique: async () => {
          throw new Error('database unavailable');
        },
      },
      session: {
        findUnique: async () => {
          throw new Error('database unavailable');
        },
      },
      $transaction: async () => {
        throw new Error('database unavailable');
      },
      $disconnect: async () => undefined,
    };

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register(testEnvironment)],
      controllers: [AuthProbeController],
    })
      .overrideProvider(PrismaService)
      .useValue(failingPrisma)
      .compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
    applySecurityMiddleware(app, testEnvironment);
    applyApplicationControls(app);
    await app.listen(0, '127.0.0.1');
    const address = app.getHttpServer().address();
    if (address === null || typeof address === 'string') {
      throw new Error('Could not determine the listening port.');
    }
    const server = { app, baseUrl: `http://127.0.0.1:${address.port}` };
    currentServer = server;

    const loginAttempt = await login(server, { origin: ORIGIN });
    expect(loginAttempt.status).toBe(500);
    expect(loginAttempt.body.error).toBe('INTERNAL_SERVER_ERROR');
    expect(loginAttempt.body).not.toHaveProperty('stack');
    expect(loginAttempt.body.message).toBe('An unexpected error occurred.');

    const health = await request(server.baseUrl).get('/health');
    expect(health.status).toBe(200);
  });

  it('handles a change-password racing another authenticated request safely', async () => {
    const server = await startServer(testEnvironment);
    currentServer = server;

    const loginResponse = await login(server, { origin: ORIGIN });
    const sessionToken = sessionTokenFromSetCookie(loginResponse.headers['set-cookie']);
    const meResponse = await request(server.baseUrl)
      .get('/auth/me')
      .set('Cookie', `${SESSION_COOKIE}=${sessionToken}`);
    const csrf = meResponse.body.csrfToken as string;

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
  });
});
