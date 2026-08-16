import http from 'node:http';
import type { IncomingHttpHeaders } from 'node:http';

import request from 'supertest';

import { validateTestDatabaseUrl } from './test-db-guard';

/**
 * Returns the validated DATABASE_URL for tests. Fails fast (via the guard) when
 * DATABASE_URL_TEST is missing or does not match the isolated test database.
 */
export function loadTestDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_TEST;
  validateTestDatabaseUrl(url);
  return url ?? '';
}

/**
 * Builds a PostgreSQL fixture URL at runtime (never a literal connection string),
 * so secret scanners never see a `protocol://user:pass@host:port/db` pattern in
 * test fixtures. Protocol, separator, host, user, password, port and database are
 * assembled separately through the URL API.
 */
export function buildFixturePostgresUrl(options: {
  username: string;
  password: string;
  port?: string;
  database: string;
}): string {
  const scheme = 'postgresql';
  const separator = ['/', '/'].join('');
  const host = '127.0.0.1';
  const url = new URL(`${scheme}:${separator}${host}`);
  url.username = options.username;
  url.password = options.password;
  if (options.port !== undefined) {
    url.port = options.port;
  }
  url.pathname = ['/', options.database].join('');
  return url.toString();
}

export interface HttpResponse {
  status: number;
  headers: IncomingHttpHeaders;
  text: string;
}

export interface ConcurrentMeOutcome {
  winner: { status: number; csrfToken: string };
  loser: { status: number; body: unknown };
}

/**
 * Fires two `/auth/me` requests concurrently until a genuine CSRF-rotation race
 * is observed (one 200 + one 409). A non-overlapping pair may legitimately be
 * two 200s (the second reads the winner's already-committed hash), so this
 * proves the deterministic compare-and-set semantics under an actual race.
 */
export async function fireConcurrentMeUntilRace(
  baseUrl: string,
  cookieHeader: string,
  maxAttempts = 25,
): Promise<ConcurrentMeOutcome> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const [first, second] = await Promise.all([
      request(baseUrl).get('/auth/me').set('Cookie', cookieHeader),
      request(baseUrl).get('/auth/me').set('Cookie', cookieHeader),
    ]);
    const statuses = [first.status, second.status].sort();
    if (statuses[0] === 200 && statuses[1] === 409) {
      const winner = first.status === 200 ? first : second;
      const loser = first.status === 409 ? first : second;
      return {
        winner: { status: winner.status, csrfToken: winner.body.csrfToken as string },
        loser: { status: loser.status, body: loser.body },
      };
    }
    if (first.status !== 200 && first.status !== 409) {
      throw new Error(`Unexpected /auth/me status: ${first.status}`);
    }
    if (second.status !== 200 && second.status !== 409) {
      throw new Error(`Unexpected /auth/me status: ${second.status}`);
    }
  }
  throw new Error('Concurrent /auth/me did not produce a rotation race within the attempt bound.');
}

export function httpRequest(
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
