import 'reflect-metadata';

import http from 'node:http';
import type { IncomingHttpHeaders } from 'node:http';

import { Controller, Get } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';

import { describe, afterEach, expect, it } from '@jest/globals';

import {
  applyApplicationControls,
  applyHttpSecurity,
  applyParserErrorHandler,
} from '../src/bootstrap';
import { parseEnvironment } from '../src/config/environment.schema';

@Controller('probe')
class ProbeController {
  @Get('ok')
  ok(): Record<string, boolean> {
    return { ok: true };
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

interface HttpResponse {
  status: number;
  headers: IncomingHttpHeaders;
  text: string;
}

interface ErrorEnvelope {
  requestId?: string;
  statusCode?: number;
  error?: string;
  message?: string;
}

const INTERNAL_MESSAGE = 'mensagem-interna-controlada-para-teste';

async function startServer(): Promise<TestServer> {
  const moduleRef = await Test.createTestingModule({
    controllers: [ProbeController],
  }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bodyParser: false });
  applyHttpSecurity(app, testEnvironment);
  app.use((_req: Request, _res: Response, next: NextFunction) => {
    next(new Error(INTERNAL_MESSAGE));
  });
  applyParserErrorHandler(app);
  applyApplicationControls(app);
  await app.listen(0, '127.0.0.1');
  const address = app.getHttpServer().address();
  if (address === null || typeof address === 'string') {
    throw new Error('Could not determine the listening port.');
  }
  return { app, baseUrl: `http://127.0.0.1:${address.port}` };
}

function httpRequest(
  baseUrl: string,
  method: string,
  path: string,
  options: { headers?: Record<string, string>; body?: string | Buffer } = {},
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const request = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method,
        headers: options.headers,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        });
        response.on('end', () => {
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            text: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    request.on('error', reject);
    if (options.body !== undefined) {
      request.write(options.body);
    }
    request.end();
  });
}

describe('pre-NestJS unknown errors', () => {
  let currentServer: TestServer | undefined;

  afterEach(async () => {
    await currentServer?.app.close();
    currentServer = undefined;
  });

  it('ends an unknown pre-NestJS error with a controlled 500 envelope', async () => {
    const server = await startServer();
    currentServer = server;

    const response = await httpRequest(server.baseUrl, 'GET', '/probe/ok');

    expect(response.status).toBe(500);
    expect(response.headers['content-type']).toMatch(/^application\/json/);

    const envelope = JSON.parse(response.text) as ErrorEnvelope;
    expect(envelope.requestId).toBeDefined();
    expect(envelope.statusCode).toBe(500);
    expect(envelope.error).toBe('INTERNAL_SERVER_ERROR');
    expect(envelope.message).toBe('An unexpected error occurred.');

    expect(response.headers['x-request-id']).toBe(envelope.requestId);

    expect(response.text).not.toContain(INTERNAL_MESSAGE);
    expect(response.text).not.toMatch(/<html/i);
    expect(response.text).not.toContain('    at ');
    expect(response.text).not.toContain('/home/');
    expect(response.text).not.toContain('node_modules');
  });
});
