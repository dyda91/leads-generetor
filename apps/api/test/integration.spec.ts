import 'reflect-metadata';

import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import request from 'supertest';

import { describe, afterEach, expect, it } from '@jest/globals';

import { AppModule } from '../src/app.module';
import { applyApplicationControls, applySecurityMiddleware } from '../src/bootstrap';
import { parseEnvironment } from '../src/config/environment.schema';
import type { Environment } from '../src/config/environment.types';

const BODY_LIMIT = 100_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class CreateItemDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsInt()
  @Min(1)
  count!: number;
}

@Controller('items')
class IntegrationProbeController {
  @Post()
  @HttpCode(201)
  create(@Body() dto: CreateItemDto): Record<string, boolean> {
    void dto;
    return { ok: true };
  }

  @Get('boom')
  boom(): never {
    throw new Error('integration-canary-detail');
  }
}

const testEnvironment = parseEnvironment({
  NODE_ENV: 'test',
  PORT: '3000',
  CORS_ORIGINS: 'https://app.example.com',
});

interface TestServer {
  app: INestApplication;
  baseUrl: string;
}

async function startServer(environment: Environment): Promise<TestServer> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register(environment)],
    controllers: [IntegrationProbeController],
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

describe('public surface integration (supertest)', () => {
  let currentServer: TestServer | undefined;

  afterEach(async () => {
    await currentServer?.app.close();
    currentServer = undefined;
  });

  describe('health', () => {
    it('returns the minimal health payload', async () => {
      const server = await startServer(testEnvironment);
      currentServer = server;
      const response = await request(server.baseUrl).get('/health').expect(200);
      expect(response.body).toEqual({ status: 'ok' });
      expect(response.headers['content-type']).toMatch(/^application\/json/);
      expect(response.headers['x-request-id']).toMatch(UUID_PATTERN);
      expect(response.headers['cache-control']).toContain('no-store');
    });

    it.each([
      ['POST', 'post'],
      ['PUT', 'put'],
      ['PATCH', 'patch'],
      ['DELETE', 'delete'],
    ] as const)('rejects %s /health', async (_label, method) => {
      const server = await startServer(testEnvironment);
      currentServer = server;
      const response = await request(server.baseUrl)[method]('/health').expect(404);
      expect(response.body.error).toBe('NOT_FOUND');
      expect(response.body.requestId).toMatch(UUID_PATTERN);
    });
  });

  describe('error contract', () => {
    it('returns a controlled 404 envelope', async () => {
      const server = await startServer(testEnvironment);
      currentServer = server;
      const response = await request(server.baseUrl).get('/missing').expect(404);
      expect(response.body).toMatchObject({
        statusCode: 404,
        error: 'NOT_FOUND',
        message: 'The requested resource was not found.',
      });
      expect(response.headers['x-request-id']).toBe(response.body.requestId);
    });

    it('returns a controlled 400 validation envelope without values', async () => {
      const server = await startServer(testEnvironment);
      currentServer = server;
      const response = await request(server.baseUrl)
        .post('/items')
        .set('Content-Type', 'application/json')
        .send({ name: 'x', count: 'not-a-number-value', extra: 'y' })
        .expect(400);
      expect(response.body.error).toBe('VALIDATION_ERROR');
      expect(response.body.details).toContainEqual({ field: 'count', type: 'invalid_type' });
      expect(response.body.details).toContainEqual({ field: 'extra', type: 'unknown_property' });
      expect(JSON.stringify(response.body)).not.toContain('not-a-number-value');
    });

    it('accepts a valid payload', async () => {
      const server = await startServer(testEnvironment);
      currentServer = server;
      await request(server.baseUrl)
        .post('/items')
        .set('Content-Type', 'application/json')
        .send({ name: 'x', count: 1 })
        .expect(201);
    });

    it('normalizes a payload over the limit to 413', async () => {
      const server = await startServer(testEnvironment);
      currentServer = server;
      const response = await request(server.baseUrl)
        .post('/items')
        .set('Content-Type', 'application/json')
        .send({ marker: 'x'.repeat(BODY_LIMIT * 2) })
        .expect(413);
      expect(response.body.error).toBe('PAYLOAD_TOO_LARGE');
      expect(response.text).not.toContain('x'.repeat(1000));
    });

    it('returns a controlled 500 without leaking the canary', async () => {
      const server = await startServer(testEnvironment);
      currentServer = server;
      const response = await request(server.baseUrl).get('/items/boom').expect(500);
      expect(response.body).toMatchObject({
        statusCode: 500,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred.',
      });
      expect(response.text).not.toContain('integration-canary-detail');
      expect(response.text).not.toContain('    at ');
    });
  });

  describe('security headers', () => {
    it('keeps the security headers on success and error responses', async () => {
      const server = await startServer(testEnvironment);
      currentServer = server;
      const success = await request(server.baseUrl).get('/health').expect(200);
      const error = await request(server.baseUrl).get('/missing').expect(404);
      for (const response of [success, error]) {
        expect(response.headers['content-security-policy']).toContain("default-src 'none'");
        expect(response.headers['x-powered-by']).toBeUndefined();
        expect(response.headers['strict-transport-security']).toBeUndefined();
        expect(response.headers['set-cookie']).toBeUndefined();
      }
    });
  });
});
