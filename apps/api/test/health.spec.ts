import 'reflect-metadata';

import { httpRequest } from './helpers';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { describe, afterEach, expect, it } from '@jest/globals';

import { AppModule } from '../src/app.module';
import { applyApplicationControls, applySecurityMiddleware } from '../src/bootstrap';
import { parseEnvironment } from '../src/config/environment.schema';
import type { Environment } from '../src/config/environment.types';

const defaultEnvironment = parseEnvironment({
  NODE_ENV: 'test',
  PORT: '3000',
  CORS_ORIGINS: 'https://app.example.com',
});

const productionEnvironment = parseEnvironment({
  NODE_ENV: 'production',
  PORT: '443',
  CORS_ORIGINS: 'https://app.example.com',
});

const limitedEnvironment = parseEnvironment({
  NODE_ENV: 'test',
  PORT: '3000',
  CORS_ORIGINS: 'https://app.example.com',
  RATE_LIMIT_TTL_MS: '1000',
  RATE_LIMIT_MAX: '2',
});

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

async function startServer(environment: Environment): Promise<TestServer> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule.register(environment)],
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

describe('health check', () => {
  let currentServer: TestServer | undefined;

  afterEach(async () => {
    await currentServer?.app.close();
    currentServer = undefined;
  });

  describe('GET /health', () => {
    it('returns 200 for an anonymous request', async () => {
      const server = await startServer(defaultEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/health');
      expect(response.status).toBe(200);
    });

    it('returns a body with only status', async () => {
      const server = await startServer(defaultEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/health');
      expect(Object.keys(JSON.parse(response.text))).toEqual(['status']);
    });

    it('returns status exactly ok', async () => {
      const server = await startServer(defaultEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/health');
      expect(JSON.parse(response.text)).toEqual({ status: 'ok' });
    });

    it('returns application/json content type', async () => {
      const server = await startServer(defaultEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/health');
      expect(response.headers['content-type']).toMatch(/^application\/json/);
    });

    it('prevents caching with Cache-Control no-store', async () => {
      const server = await startServer(defaultEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/health');
      expect(response.headers['cache-control']).toContain('no-store');
    });

    it('includes a server-generated request ID header', async () => {
      const server = await startServer(defaultEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/health');
      expect(response.headers['x-request-id']).toMatch(UUID_PATTERN);
    });

    it('does not expose X-Powered-By', async () => {
      const server = await startServer(defaultEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/health');
      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    it('keeps the restrictive CSP header', async () => {
      const server = await startServer(defaultEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/health');
      expect(response.headers['content-security-policy']).toContain("default-src 'none'");
    });

    it('follows the environment for HSTS', async () => {
      const testServer = await startServer(defaultEnvironment);
      const testResponse = await httpRequest(testServer.baseUrl, 'GET', '/health');
      expect(testResponse.headers['strict-transport-security']).toBeUndefined();
      await testServer.app.close();

      const prodServer = await startServer(productionEnvironment);
      currentServer = prodServer;
      const prodResponse = await httpRequest(prodServer.baseUrl, 'GET', '/health');
      expect(prodResponse.headers['strict-transport-security']).toBeDefined();
    });

    it('does not set any cookie', async () => {
      const server = await startServer(defaultEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/health');
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('does not expose internal data in the body', async () => {
      const server = await startServer(defaultEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/health');
      expect(response.text).not.toContain('uptime');
      expect(response.text).not.toContain('hostname');
      expect(response.text).not.toContain('version');
      expect(response.text).not.toContain('NODE_ENV');
      expect(response.text).not.toContain('postgres');
      expect(response.text).not.toContain('redis');
    });
  });

  describe('HTTP methods', () => {
    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('rejects %s /health', async (method) => {
      const server = await startServer(defaultEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, method, '/health');
      expect(response.status).toBe(404);
    });

    it('returns 404 for a similar route', async () => {
      const server = await startServer(defaultEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/health/details');
      expect(response.status).toBe(404);
    });

    it('serves HEAD without a body', async () => {
      const server = await startServer(defaultEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'HEAD', '/health');
      expect(response.status).toBe(200);
      expect(response.text).toBe('');
    });

    it('answers an authorized OPTIONS preflight without exposing details', async () => {
      const server = await startServer(defaultEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'OPTIONS', '/health', {
        headers: { Origin: 'https://app.example.com', 'Access-Control-Request-Method': 'GET' },
      });
      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe('https://app.example.com');
      expect(response.text).toBe('');
    });
  });

  describe('errors follow the safe envelope', () => {
    it('returns the controlled envelope for a rejected method', async () => {
      const server = await startServer(defaultEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'POST', '/health');
      expect(response.status).toBe(404);
      const envelope = JSON.parse(response.text) as ErrorEnvelope;
      expect(envelope.requestId).toMatch(UUID_PATTERN);
      expect(envelope.statusCode).toBe(404);
      expect(envelope.error).toBe('NOT_FOUND');
      expect(envelope.message).toBe('The requested resource was not found.');
    });
  });

  describe('rate limiting', () => {
    it('participates in the global rate limit', async () => {
      const server = await startServer(limitedEnvironment);
      currentServer = server;
      expect((await httpRequest(server.baseUrl, 'GET', '/health')).status).toBe(200);
      expect((await httpRequest(server.baseUrl, 'GET', '/health')).status).toBe(200);
      const exceeded = await httpRequest(server.baseUrl, 'GET', '/health');
      expect(exceeded.status).toBe(429);
    });

    it('returns 429 without internal details', async () => {
      const server = await startServer(limitedEnvironment);
      currentServer = server;
      await httpRequest(server.baseUrl, 'GET', '/health');
      await httpRequest(server.baseUrl, 'GET', '/health');
      const response = await httpRequest(server.baseUrl, 'GET', '/health');
      const envelope = JSON.parse(response.text) as ErrorEnvelope;
      expect(envelope.error).toBe('RATE_LIMIT_EXCEEDED');
      expect(response.headers['x-request-id']).toBe(envelope.requestId);
      expect(response.text).not.toContain('127.0.0.1');
      expect(response.text).not.toContain('    at ');
    });

    it('recovers after the window expires', async () => {
      const server = await startServer(limitedEnvironment);
      currentServer = server;
      await httpRequest(server.baseUrl, 'GET', '/health');
      await httpRequest(server.baseUrl, 'GET', '/health');
      expect((await httpRequest(server.baseUrl, 'GET', '/health')).status).toBe(429);

      await new Promise((resolve) => setTimeout(resolve, 2500));

      expect((await httpRequest(server.baseUrl, 'GET', '/health')).status).toBe(200);
    }, 10_000);
  });
});
