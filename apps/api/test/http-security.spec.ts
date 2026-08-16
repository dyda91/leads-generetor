import 'reflect-metadata';

import { httpRequest } from './helpers';
import { gzipSync } from 'node:zlib';

import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { Request } from 'express';

import { describe, afterEach, expect, it } from '@jest/globals';

import { applySecurityMiddleware } from '../src/bootstrap';
import { parseEnvironment } from '../src/config/environment.schema';
import type { Environment } from '../src/config/environment.types';

@Controller('probe')
class ProbeController {
  @Get()
  @HttpCode(200)
  get(@Req() req: Request): Record<string, unknown> {
    return { query: req.query, ip: req.ip };
  }

  @Post()
  @HttpCode(200)
  post(@Body() body: unknown): Record<string, unknown> {
    return { received: body };
  }
}

interface TestServer {
  app: INestApplication;
  baseUrl: string;
}

interface ProbeResponse {
  query?: Record<string, string | string[] | undefined>;
  ip?: string;
  received?: unknown;
}

const AUTHORIZED_ORIGIN = 'https://app.example.com';
const BODY_LIMIT = 100_000;

const testEnvironment = parseEnvironment({
  NODE_ENV: 'test',
  PORT: '3000',
  CORS_ORIGINS: `${AUTHORIZED_ORIGIN}, http://localhost:4173`,
});

const productionEnvironment = parseEnvironment({
  NODE_ENV: 'production',
  PORT: '443',
  CORS_ORIGINS: AUTHORIZED_ORIGIN,
});

async function startServer(environment: Environment): Promise<TestServer> {
  const moduleRef = await Test.createTestingModule({
    controllers: [ProbeController],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  applySecurityMiddleware(app, environment);
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  if (address === null || typeof address === 'string') {
    throw new Error('Could not determine the listening port.');
  }
  return { app, baseUrl: `http://127.0.0.1:${address.port}` };
}

describe('HTTP security bootstrap', () => {
  let currentServer: TestServer | undefined;

  afterEach(async () => {
    await currentServer?.app.close();
    currentServer = undefined;
  });

  describe('headers', () => {
    it('does not expose X-Powered-By', async () => {
      const server = await startServer(testEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/probe');
      expect(response.headers['x-powered-by']).toBeUndefined();
    });

    it('sends a restrictive CSP without unsafe directives', async () => {
      const server = await startServer(testEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/probe');
      const csp = response.headers['content-security-policy'];
      expect(csp).toBeDefined();
      expect(csp).toContain("default-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).toContain("base-uri 'none'");
      expect(csp).not.toContain('unsafe-inline');
      expect(csp).not.toContain('unsafe-eval');
    });

    it('sends HSTS in production', async () => {
      const server = await startServer(productionEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/probe');
      expect(response.headers['strict-transport-security']).toBeDefined();
      expect(response.headers['strict-transport-security']).toContain('max-age=');
    });

    it('does not send HSTS in development or test', async () => {
      const server = await startServer(testEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/probe');
      expect(response.headers['strict-transport-security']).toBeUndefined();
    });

    it('does not reveal framework or runtime versions in headers', async () => {
      const server = await startServer(testEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/probe');
      for (const value of Object.values(response.headers)) {
        expect(String(value)).not.toMatch(/express|node/i);
      }
    });
  });

  describe('CORS', () => {
    it('allows an authorized exact origin', async () => {
      const server = await startServer(testEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/probe', {
        headers: { Origin: AUTHORIZED_ORIGIN },
      });
      expect(response.headers['access-control-allow-origin']).toBe(AUTHORIZED_ORIGIN);
      expect(response.headers['access-control-allow-origin']).not.toBe('*');
    });

    it('rejects a similar but malicious origin', async () => {
      const server = await startServer(testEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/probe', {
        headers: { Origin: 'https://app.example.com.evil.com' },
      });
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('rejects an unauthorized subdomain', async () => {
      const server = await startServer(testEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/probe', {
        headers: { Origin: 'https://sub.app.example.com' },
      });
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('rejects an origin with a different port', async () => {
      const server = await startServer(testEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/probe', {
        headers: { Origin: 'https://app.example.com:8443' },
      });
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('allows a request without an Origin header', async () => {
      const server = await startServer(testEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/probe');
      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('rejects the special null origin', async () => {
      const server = await startServer(testEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/probe', {
        headers: { Origin: 'null' },
      });
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('does not enable credentials', async () => {
      const server = await startServer(testEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/probe', {
        headers: { Origin: AUTHORIZED_ORIGIN },
      });
      expect(response.headers['access-control-allow-credentials']).toBeUndefined();
    });

    it('answers an authorized preflight', async () => {
      const server = await startServer(testEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'OPTIONS', '/probe', {
        headers: { Origin: AUTHORIZED_ORIGIN, 'Access-Control-Request-Method': 'POST' },
      });
      expect(response.status).toBe(204);
      expect(response.headers['access-control-allow-origin']).toBe(AUTHORIZED_ORIGIN);
      expect(response.headers['access-control-allow-methods']).toBeDefined();
    });

    it('rejects an unauthorized preflight', async () => {
      const server = await startServer(testEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'OPTIONS', '/probe', {
        headers: { Origin: 'https://evil.example.com', 'Access-Control-Request-Method': 'POST' },
      });
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('normalizes origins consistently', async () => {
      const server = await startServer(testEnvironment);
      currentServer = server;
      const trailingSlash = await httpRequest(server.baseUrl, 'GET', '/probe', {
        headers: { Origin: 'https://app.example.com/' },
      });
      expect(trailingSlash.headers['access-control-allow-origin']).toBe(AUTHORIZED_ORIGIN);

      const defaultPort = await httpRequest(server.baseUrl, 'GET', '/probe', {
        headers: { Origin: 'https://app.example.com:443' },
      });
      expect(defaultPort.headers['access-control-allow-origin']).toBe(AUTHORIZED_ORIGIN);
    });

    it('emits Vary: Origin for an authorized origin', async () => {
      const server = await startServer(testEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/probe', {
        headers: { Origin: AUTHORIZED_ORIGIN },
      });
      expect(response.headers['vary']).toBe('Origin');
    });

    it('does not interfere with server-to-server clients without an Origin header', async () => {
      const server = await startServer(testEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/probe');
      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBeUndefined();
    });
  });

  describe('payload limits', () => {
    it('accepts a JSON body within the limit', async () => {
      const server = await startServer(testEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'POST', '/probe', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ a: 1 }),
      });
      expect(response.status).toBe(200);
      const body = JSON.parse(response.text) as ProbeResponse;
      expect(body.received).toEqual({ a: 1 });
    });

    it('rejects a JSON body above the limit with 413', async () => {
      const server = await startServer(testEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'POST', '/probe', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marker: 'x'.repeat(BODY_LIMIT * 2) }),
      });
      expect(response.status).toBe(413);
      expect(response.text).not.toContain('x'.repeat(1000));
    });

    it('rejects a URL-encoded body above the limit with 413', async () => {
      const server = await startServer(testEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'POST', '/probe', {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `a=${'x'.repeat(BODY_LIMIT * 2)}`,
      });
      expect(response.status).toBe(413);
      expect(response.text).not.toContain('x'.repeat(1000));
    });

    it('rejects an excess of URL-encoded parameters', async () => {
      const server = await startServer(testEnvironment);
      currentServer = server;
      const params = Array.from({ length: 150 }, (_, index) => `p${index}=1`).join('&');
      const response = await httpRequest(server.baseUrl, 'POST', '/probe', {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
      });
      expect(response.status).toBe(413);
    });

    it('rejects a compressed body when inflate is disabled', async () => {
      const server = await startServer(testEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'POST', '/probe', {
        headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
        body: gzipSync(JSON.stringify({ a: 1 })),
      });
      expect(response.status).toBe(415);
    });

    it('does not parse a body with an unsupported content type', async () => {
      const server = await startServer(testEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'POST', '/probe', {
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ marker: 'x' }),
      });
      expect(response.status).toBe(200);
      expect(response.text).not.toContain('marker');
    });
  });

  describe('query parser and proxy', () => {
    it('parses simple query parameters', async () => {
      const server = await startServer(testEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/probe?page=2&limit=10');
      const body = JSON.parse(response.text) as ProbeResponse;
      expect(body.query?.page).toBe('2');
      expect(body.query?.limit).toBe('10');
    });

    it('does not interpret nested query notation as an object', async () => {
      const server = await startServer(testEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/probe?filter[name]=x');
      const body = JSON.parse(response.text) as ProbeResponse;
      expect(body.query?.['filter[name]']).toBe('x');
      expect(body.query?.filter).toBeUndefined();
    });

    it('does not pollute Object.prototype via query keys', async () => {
      const server = await startServer(testEnvironment);
      currentServer = server;
      const response = await httpRequest(
        server.baseUrl,
        'GET',
        '/probe?__proto__[polluted]=yes&constructor[polluted]=yes&prototype[polluted]=yes',
      );
      expect(response.status).toBe(200);
      const plain = {} as Record<string, unknown>;
      expect(plain.polluted).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted')).toBe(false);
    });

    it('keeps trust proxy disabled so X-Forwarded-For is ignored', async () => {
      const server = await startServer(testEnvironment);
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/probe', {
        headers: { 'X-Forwarded-For': '1.2.3.4' },
      });
      const body = JSON.parse(response.text) as ProbeResponse;
      expect(body.ip).toBe('127.0.0.1');
    });
  });
});
