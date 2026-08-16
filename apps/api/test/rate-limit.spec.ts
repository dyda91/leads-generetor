import 'reflect-metadata';

import { httpRequest, loadTestDatabaseUrl } from './helpers';
import { gzipSync } from 'node:zlib';

import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { IsNotEmpty, IsString } from 'class-validator';
import type { Request } from 'express';

import { describe, afterEach, expect, it } from '@jest/globals';

import { applyApplicationControls, applySecurityMiddleware } from '../src/bootstrap';
import { parseEnvironment } from '../src/config/environment.schema';

const BODY_LIMIT = 100_000;

class RateLimitProbeDto {
  @IsString()
  @IsNotEmpty()
  name!: string;
}

@Controller('rl')
class RateLimitProbeController {
  @Get()
  @HttpCode(200)
  get(@Req() req: Request): Record<string, unknown> {
    return { ok: true, ip: req.ip };
  }

  @Post()
  @HttpCode(201)
  create(@Body() dto: RateLimitProbeDto): Record<string, boolean> {
    void dto;
    return { ok: true };
  }

  @Get('boom')
  boom(): never {
    throw new Error('rate-limit-internal-detail');
  }
}

const testEnvironment = parseEnvironment({
  NODE_ENV: 'test',
  PORT: '3000',
  CORS_ORIGINS: 'https://app.example.com',
  DATABASE_URL: loadTestDatabaseUrl(),
});

interface TestServer {
  app: INestApplication;
  baseUrl: string;
}

interface ErrorEnvelope {
  requestId?: string;
  statusCode?: number;
  error?: string;
  message?: string;
}

async function startServer(limit: number, ttlMs: number): Promise<TestServer> {
  const moduleRef = await Test.createTestingModule({
    controllers: [RateLimitProbeController],
    imports: [ThrottlerModule.forRoot([{ ttl: ttlMs, limit, setHeaders: false }])],
    providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  applySecurityMiddleware(app, testEnvironment);
  applyApplicationControls(app);
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  if (address === null || typeof address === 'string') {
    throw new Error('Could not determine the listening port.');
  }
  return { app, baseUrl: `http://127.0.0.1:${address.port}` };
}

function envelopeOf(text: string): ErrorEnvelope {
  return JSON.parse(text) as ErrorEnvelope;
}

describe('rate limiting', () => {
  let currentServer: TestServer | undefined;

  afterEach(async () => {
    await currentServer?.app.close();
    currentServer = undefined;
  });

  it('allows requests below the limit', async () => {
    const server = await startServer(5, 60_000);
    currentServer = server;
    for (let index = 0; index < 3; index += 1) {
      const response = await httpRequest(server.baseUrl, 'GET', '/rl');
      expect(response.status).toBe(200);
    }
  });

  it('returns 429 when the limit is exceeded', async () => {
    const server = await startServer(3, 60_000);
    currentServer = server;
    for (let index = 0; index < 3; index += 1) {
      expect((await httpRequest(server.baseUrl, 'GET', '/rl')).status).toBe(200);
    }
    const exceeded = await httpRequest(server.baseUrl, 'GET', '/rl');
    expect(exceeded.status).toBe(429);
  });

  it('returns exactly the error envelope on 429', async () => {
    const server = await startServer(1, 60_000);
    currentServer = server;
    await httpRequest(server.baseUrl, 'GET', '/rl');
    const response = await httpRequest(server.baseUrl, 'GET', '/rl');
    expect(response.status).toBe(429);
    const envelope = envelopeOf(response.text);
    expect(envelope).toEqual({
      requestId: expect.any(String),
      statusCode: 429,
      error: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests',
    });
  });

  it('uses the same request ID in the header and the 429 envelope', async () => {
    const server = await startServer(1, 60_000);
    currentServer = server;
    await httpRequest(server.baseUrl, 'GET', '/rl');
    const response = await httpRequest(server.baseUrl, 'GET', '/rl');
    const envelope = envelopeOf(response.text);
    expect(response.headers['x-request-id']).toBe(envelope.requestId);
  });

  it('does not expose IP, tracker internals, stack or implementation details on 429', async () => {
    const server = await startServer(1, 60_000);
    currentServer = server;
    await httpRequest(server.baseUrl, 'GET', '/rl');
    const response = await httpRequest(server.baseUrl, 'GET', '/rl');
    expect(response.status).toBe(429);
    expect(response.text).not.toContain('127.0.0.1');
    expect(response.text).not.toContain('totalHits');
    expect(response.text).not.toContain('blockExpiresAt');
    expect(response.text).not.toContain('    at ');
    expect(response.text).not.toContain('Throttler');
  });

  it('does not let X-Forwarded-For alter the tracker', async () => {
    const server = await startServer(2, 60_000);
    currentServer = server;
    const first = await httpRequest(server.baseUrl, 'GET', '/rl');
    expect(first.status).toBe(200);
    const second = await httpRequest(server.baseUrl, 'GET', '/rl', {
      headers: { 'X-Forwarded-For': '1.2.3.4' },
    });
    expect(second.status).toBe(200);
    const third = await httpRequest(server.baseUrl, 'GET', '/rl', {
      headers: { 'X-Forwarded-For': '5.6.7.8' },
    });
    expect(third.status).toBe(429);
  });

  it('does not let X-Real-IP alter the tracker', async () => {
    const server = await startServer(2, 60_000);
    currentServer = server;
    const first = await httpRequest(server.baseUrl, 'GET', '/rl');
    expect(first.status).toBe(200);
    const second = await httpRequest(server.baseUrl, 'GET', '/rl', {
      headers: { 'X-Real-IP': '9.9.9.9' },
    });
    expect(second.status).toBe(200);
    const third = await httpRequest(server.baseUrl, 'GET', '/rl', {
      headers: { 'X-Real-IP': '8.8.8.8' },
    });
    expect(third.status).toBe(429);
  });

  it('does not let a changing X-Request-Id bypass the limit', async () => {
    const server = await startServer(2, 60_000);
    currentServer = server;
    const first = await httpRequest(server.baseUrl, 'GET', '/rl', {
      headers: { 'X-Request-Id': 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
    });
    expect(first.status).toBe(200);
    const second = await httpRequest(server.baseUrl, 'GET', '/rl', {
      headers: { 'X-Request-Id': 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' },
    });
    expect(second.status).toBe(200);
    const third = await httpRequest(server.baseUrl, 'GET', '/rl', {
      headers: { 'X-Request-Id': 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' },
    });
    expect(third.status).toBe(429);
  });

  it('respects the limit under concurrent requests', async () => {
    const server = await startServer(5, 60_000);
    currentServer = server;
    const total = 12;
    const responses = await Promise.all(
      Array.from({ length: total }, () => httpRequest(server.baseUrl, 'GET', '/rl')),
    );
    const okCount = responses.filter((response) => response.status === 200).length;
    const limitedCount = responses.filter((response) => response.status === 429).length;
    expect(okCount).toBe(5);
    expect(limitedCount).toBe(total - 5);
  });

  it('allows requests again after the window expires', async () => {
    const server = await startServer(2, 300);
    currentServer = server;
    expect((await httpRequest(server.baseUrl, 'GET', '/rl')).status).toBe(200);
    expect((await httpRequest(server.baseUrl, 'GET', '/rl')).status).toBe(200);
    expect((await httpRequest(server.baseUrl, 'GET', '/rl')).status).toBe(429);

    await new Promise((resolve) => setTimeout(resolve, 700));

    expect((await httpRequest(server.baseUrl, 'GET', '/rl')).status).toBe(200);
  }, 10_000);

  it('keeps trust proxy disabled (observed address is the loopback)', async () => {
    const server = await startServer(100, 60_000);
    currentServer = server;
    const response = await httpRequest(server.baseUrl, 'GET', '/rl', {
      headers: { 'X-Forwarded-For': '1.2.3.4', 'X-Real-IP': '9.9.9.9' },
    });
    const body = JSON.parse(response.text) as { ip?: string };
    expect(body.ip).toBe('127.0.0.1');
  });

  it('keeps the previous error contract for 400/404/413/415/500 with throttling active', async () => {
    const server = await startServer(100, 60_000);
    currentServer = server;

    const validation = await httpRequest(server.baseUrl, 'POST', '/rl', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x', extra: 'y' }),
    });
    expect(validation.status).toBe(400);
    expect(envelopeOf(validation.text).error).toBe('VALIDATION_ERROR');

    const notFound = await httpRequest(server.baseUrl, 'GET', '/rl/missing');
    expect(notFound.status).toBe(404);
    expect(envelopeOf(notFound.text).error).toBe('NOT_FOUND');

    const tooLarge = await httpRequest(server.baseUrl, 'POST', '/rl', {
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ marker: 'x'.repeat(BODY_LIMIT * 2) }),
    });
    expect(tooLarge.status).toBe(413);
    expect(envelopeOf(tooLarge.text).error).toBe('PAYLOAD_TOO_LARGE');

    const compressed = await httpRequest(server.baseUrl, 'POST', '/rl', {
      headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
      body: gzipSync(JSON.stringify({ name: 'x' })),
    });
    expect(compressed.status).toBe(415);
    expect(envelopeOf(compressed.text).error).toBe('UNSUPPORTED_MEDIA_TYPE');

    const unexpected = await httpRequest(server.baseUrl, 'GET', '/rl/boom');
    expect(unexpected.status).toBe(500);
    expect(envelopeOf(unexpected.text).error).toBe('INTERNAL_SERVER_ERROR');
  });

  it('does not expose sensitive rate-limit headers', async () => {
    const server = await startServer(1, 60_000);
    currentServer = server;
    await httpRequest(server.baseUrl, 'GET', '/rl');
    const response = await httpRequest(server.baseUrl, 'GET', '/rl');
    expect(response.status).toBe(429);
    expect(response.headers['retry-after']).toBeUndefined();
    expect(response.headers['x-ratelimit-limit']).toBeUndefined();
    expect(response.headers['x-ratelimit-remaining']).toBeUndefined();
    expect(response.headers['x-ratelimit-reset']).toBeUndefined();
  });
});
