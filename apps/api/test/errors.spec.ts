import 'reflect-metadata';

import { httpRequest, loadTestDatabaseUrl } from './helpers';
import { gzipSync } from 'node:zlib';

import { Body, Controller, Get, HttpCode, NotFoundException, Post, Res } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { IsInt, IsNotEmpty, IsString, Min } from 'class-validator';
import type { Response } from 'express';

import { describe, afterEach, expect, it } from '@jest/globals';

import { applyApplicationControls, applySecurityMiddleware } from '../src/bootstrap';
import { parseEnvironment } from '../src/config/environment.schema';

const BODY_LIMIT = 100_000;

class CreateItemDto {
  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsInt()
  @Min(1)
  count!: number;
}

@Controller('items')
class ItemsController {
  @Post()
  @HttpCode(201)
  create(@Body() dto: CreateItemDto): Record<string, boolean> {
    void dto;
    return { ok: true };
  }

  @Get('boom')
  boom(): never {
    throw new Error('internal secret detail');
  }

  @Get('not-found')
  notFound(): never {
    throw new NotFoundException('custom not found message');
  }

  @Get('partial')
  partial(@Res() res: Response): void {
    res.write('partial-body-sent');
    throw new Error('error-after-headers-sent');
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
  details?: Array<{ field?: string; type?: string }>;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function startServer(): Promise<TestServer> {
  const moduleRef = await Test.createTestingModule({
    controllers: [ItemsController],
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

describe('error contract and request ID', () => {
  let currentServer: TestServer | undefined;

  afterEach(async () => {
    await currentServer?.app.close();
    currentServer = undefined;
  });

  describe('request ID', () => {
    it('generates a request ID on a success response', async () => {
      const server = await startServer();
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'POST', '/items', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'x', count: 2 }),
      });
      expect(response.status).toBe(201);
      expect(response.headers['x-request-id']).toBeDefined();
    });

    it('generates a request ID on a 404 response', async () => {
      const server = await startServer();
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/missing');
      expect(response.status).toBe(404);
      expect(response.headers['x-request-id']).toBeDefined();
    });

    it('ignores a client-supplied X-Request-Id', async () => {
      const server = await startServer();
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'POST', '/items', {
        headers: { 'Content-Type': 'application/json', 'X-Request-Id': 'client-supplied-id' },
        body: JSON.stringify({ name: 'x', count: 2 }),
      });
      expect(response.headers['x-request-id']).not.toBe('client-supplied-id');
      expect(response.headers['x-request-id']).toMatch(UUID_PATTERN);
    });

    it('returns distinct request IDs for distinct requests', async () => {
      const server = await startServer();
      currentServer = server;
      const first = await httpRequest(server.baseUrl, 'GET', '/missing');
      const second = await httpRequest(server.baseUrl, 'GET', '/missing');
      expect(first.headers['x-request-id']).toBeDefined();
      expect(second.headers['x-request-id']).toBeDefined();
      expect(first.headers['x-request-id']).not.toBe(second.headers['x-request-id']);
    });

    it('uses the same request ID in the header and the error envelope', async () => {
      const server = await startServer();
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'POST', '/items', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'x', count: 1, extra: 'y' }),
      });
      const envelope = envelopeOf(response.text);
      expect(response.headers['x-request-id']).toBe(envelope.requestId);
    });

    it('returns a valid UUID request ID', async () => {
      const server = await startServer();
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/missing');
      expect(response.headers['x-request-id']).toMatch(UUID_PATTERN);
    });
  });

  describe('validation', () => {
    it('rejects unknown properties with 400', async () => {
      const server = await startServer();
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'POST', '/items', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'x', count: 1, extra: 'y' }),
      });
      expect(response.status).toBe(400);
      const envelope = envelopeOf(response.text);
      expect(envelope.error).toBe('VALIDATION_ERROR');
      expect(envelope.message).toBe('Request validation failed');
      expect(envelope.details).toContainEqual({ field: 'extra', type: 'unknown_property' });
    });

    it('rejects invalid types with 400', async () => {
      const server = await startServer();
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'POST', '/items', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'x', count: 'abc' }),
      });
      expect(response.status).toBe(400);
      const envelope = envelopeOf(response.text);
      expect(envelope.error).toBe('VALIDATION_ERROR');
      expect(envelope.details).toContainEqual({ field: 'count', type: 'invalid_type' });
    });

    it('rejects an unexpected payload shape', async () => {
      const server = await startServer();
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'POST', '/items', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([1, 2, 3]),
      });
      expect(response.status).toBe(400);
      const envelope = envelopeOf(response.text);
      expect(envelope.error).toBe('VALIDATION_ERROR');
      expect(envelope.details).toBeDefined();
    });

    it('keeps received values out of validation details', async () => {
      const server = await startServer();
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'POST', '/items', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'x', count: 'not-a-number-value' }),
      });
      expect(response.status).toBe(400);
      expect(response.text).not.toContain('not-a-number-value');
    });

    it('keeps target and original objects out of validation details', async () => {
      const server = await startServer();
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'POST', '/items', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'x', count: 1, extra: 'y' }),
      });
      expect(response.status).toBe(400);
      expect(response.text).not.toContain('target');
      expect(response.text).not.toContain('CreateItemDto');
    });
  });

  describe('pre-NestJS parser errors', () => {
    it('normalizes malformed JSON to a 400 envelope', async () => {
      const server = await startServer();
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'POST', '/items', {
        headers: { 'Content-Type': 'application/json' },
        body: '{ bad json',
      });
      expect(response.status).toBe(400);
      const envelope = envelopeOf(response.text);
      expect(envelope.error).toBe('MALFORMED_JSON');
      expect(envelope.requestId).toBeDefined();
    });

    it('normalizes a JSON body over the limit to a 413 envelope', async () => {
      const server = await startServer();
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'POST', '/items', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ marker: 'x'.repeat(BODY_LIMIT * 2) }),
      });
      expect(response.status).toBe(413);
      const envelope = envelopeOf(response.text);
      expect(envelope.error).toBe('PAYLOAD_TOO_LARGE');
      expect(envelope.requestId).toBeDefined();
      expect(response.text).not.toContain('x'.repeat(1000));
    });

    it('normalizes a URL-encoded body over the limit to a 413 envelope', async () => {
      const server = await startServer();
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'POST', '/items', {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `a=${'x'.repeat(BODY_LIMIT * 2)}`,
      });
      expect(response.status).toBe(413);
      const envelope = envelopeOf(response.text);
      expect(envelope.error).toBe('PAYLOAD_TOO_LARGE');
      expect(response.text).not.toContain('x'.repeat(1000));
    });

    it('normalizes unsupported compression to a 415 envelope', async () => {
      const server = await startServer();
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'POST', '/items', {
        headers: { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip' },
        body: gzipSync(JSON.stringify({ name: 'x', count: 1 })),
      });
      expect(response.status).toBe(415);
      const envelope = envelopeOf(response.text);
      expect(envelope.error).toBe('UNSUPPORTED_MEDIA_TYPE');
      expect(envelope.requestId).toBeDefined();
    });
  });

  describe('NestJS exceptions', () => {
    it('follows the error contract for 404', async () => {
      const server = await startServer();
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/missing');
      expect(response.status).toBe(404);
      const envelope = envelopeOf(response.text);
      expect(envelope.statusCode).toBe(404);
      expect(envelope.error).toBe('NOT_FOUND');
      expect(envelope.message).toBe('The requested resource was not found.');
      expect(envelope.requestId).toMatch(UUID_PATTERN);
    });

    it('maps an HttpException to the controlled catalog', async () => {
      const server = await startServer();
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/items/not-found');
      expect(response.status).toBe(404);
      const envelope = envelopeOf(response.text);
      expect(envelope.error).toBe('NOT_FOUND');
      expect(response.text).not.toContain('custom not found message');
    });

    it('returns a controlled 500 for unexpected errors', async () => {
      const server = await startServer();
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/items/boom');
      expect(response.status).toBe(500);
      const envelope = envelopeOf(response.text);
      expect(envelope.statusCode).toBe(500);
      expect(envelope.error).toBe('INTERNAL_SERVER_ERROR');
      expect(envelope.message).toBe('An unexpected error occurred.');
      expect(envelope.requestId).toMatch(UUID_PATTERN);
    });

    it('does not leak exception.message on unexpected errors', async () => {
      const server = await startServer();
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/items/boom');
      expect(response.status).toBe(500);
      expect(response.text).not.toContain('internal secret detail');
    });
  });

  describe('response hygiene', () => {
    it('never includes a stack trace in responses', async () => {
      const server = await startServer();
      currentServer = server;
      const responses = [
        await httpRequest(server.baseUrl, 'GET', '/items/boom'),
        await httpRequest(server.baseUrl, 'GET', '/missing'),
        await httpRequest(server.baseUrl, 'POST', '/items', {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: 'x', count: 'abc' }),
        }),
        await httpRequest(server.baseUrl, 'POST', '/items', {
          headers: { 'Content-Type': 'application/json' },
          body: '{ bad json',
        }),
      ];
      for (const response of responses) {
        expect(response.text).not.toContain('    at ');
        expect(response.text).not.toContain('Error:');
      }
    });

    it('never includes a local path in responses', async () => {
      const server = await startServer();
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/items/boom');
      expect(response.status).toBe(500);
      expect(response.text).not.toContain('/home/');
      expect(response.text).not.toContain('apps/api');
      expect(response.text).not.toContain('node_modules');
    });

    it('returns application/json content type', async () => {
      const server = await startServer();
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/missing');
      expect(response.headers['content-type']).toMatch(/^application\/json/);
    });
  });

  it('keeps parallel requests isolated with distinct request IDs', async () => {
    const server = await startServer();
    currentServer = server;
    const count = 10;
    const responses = await Promise.all(
      Array.from({ length: count }, () => httpRequest(server.baseUrl, 'GET', '/missing')),
    );
    const ids = responses.map((response) => response.headers['x-request-id']);
    expect(ids.every((id) => id !== undefined)).toBe(true);
    expect(new Set(ids).size).toBe(count);
    for (const response of responses) {
      const envelope = envelopeOf(response.text);
      expect(response.headers['x-request-id']).toBe(envelope.requestId);
    }
  });

  describe('error responses keep the security headers', () => {
    it('applies CSP, no X-Powered-By and no version headers to a 404', async () => {
      const server = await startServer();
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/missing');
      expect(response.status).toBe(404);
      expect(response.headers['content-security-policy']).toContain("default-src 'none'");
      expect(response.headers['x-powered-by']).toBeUndefined();
      expect(response.headers['strict-transport-security']).toBeUndefined();
      for (const value of Object.values(response.headers)) {
        expect(String(value)).not.toMatch(/express|node/i);
      }
    });

    it('applies CSP, no X-Powered-By and no version headers to a 500', async () => {
      const server = await startServer();
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/items/boom');
      expect(response.status).toBe(500);
      expect(response.headers['content-security-policy']).toContain("default-src 'none'");
      expect(response.headers['x-powered-by']).toBeUndefined();
      for (const value of Object.values(response.headers)) {
        expect(String(value)).not.toMatch(/express|node/i);
      }
    });
  });

  describe('prototype pollution resistance', () => {
    it('does not pollute Object.prototype via a request body', async () => {
      const server = await startServer();
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'POST', '/items', {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'x',
          count: 1,
          __proto__: { polluted: 'yes' },
          constructor: { polluted: 'yes' },
          prototype: { polluted: 'yes' },
        }),
      });
      expect(response.status).toBe(201);
      const plain = {} as Record<string, unknown>;
      expect(plain.polluted).toBeUndefined();
      expect(Object.prototype.hasOwnProperty.call(Object.prototype, 'polluted')).toBe(false);
    });
  });

  describe('headers already sent', () => {
    it('does not write a duplicate response when headers were already sent', async () => {
      const server = await startServer();
      currentServer = server;
      const response = await httpRequest(server.baseUrl, 'GET', '/items/partial');
      expect(response.text).toBe('partial-body-sent');
      expect(response.text).not.toContain('INTERNAL_SERVER_ERROR');
    });
  });
});
