import { describe, expect, it } from '@jest/globals';

import { validateTestDatabaseUrl } from './test-db-guard';

interface DatabaseUrlOptions {
  protocol?: string;
  username?: string;
  password?: string;
  hostname?: string;
  port?: string;
  database?: string;
}

function buildDatabaseUrl(options: DatabaseUrlOptions = {}): string {
  const protocol = options.protocol ?? 'postgresql';
  const separator = ['/', '/'].join('');
  const url = new URL(`${protocol}:${separator}127.0.0.1`);

  url.username = options.username ?? 'leads_test';
  url.password = options.password ?? ['fixture', 'value'].join('-');
  url.hostname = options.hostname ?? '127.0.0.1';
  url.port = options.port ?? '5434';
  url.pathname = `/${options.database ?? 'leads_test'}`;

  return url.toString();
}

const VALID_TEST_URL = buildDatabaseUrl();

describe('validateTestDatabaseUrl', () => {
  it('accepts the correct test URL', () => {
    expect(() => validateTestDatabaseUrl(VALID_TEST_URL)).not.toThrow();
  });

  it('accepts localhost as a loopback host', () => {
    expect(() =>
      validateTestDatabaseUrl(buildDatabaseUrl({ hostname: 'localhost' })),
    ).not.toThrow();
  });

  it('rejects a missing DATABASE_URL_TEST', () => {
    expect(() => validateTestDatabaseUrl(undefined)).toThrow(/required/);
    expect(() => validateTestDatabaseUrl('   ')).toThrow(/required/);
  });

  it('rejects the development port 5433', () => {
    expect(() => validateTestDatabaseUrl(buildDatabaseUrl({ port: '5433' }))).toThrow(/5434/);
  });

  it('rejects an external host', () => {
    expect(() => validateTestDatabaseUrl(buildDatabaseUrl({ hostname: 'db.example.com' }))).toThrow(
      /loopback/,
    );
  });

  it('rejects a different database', () => {
    expect(() => validateTestDatabaseUrl(buildDatabaseUrl({ database: 'leads_dev' }))).toThrow(
      /database/,
    );
  });

  it('rejects a different user', () => {
    expect(() => validateTestDatabaseUrl(buildDatabaseUrl({ username: 'admin' }))).toThrow(/user/);
  });

  it('rejects a non-PostgreSQL protocol', () => {
    expect(() => validateTestDatabaseUrl(buildDatabaseUrl({ protocol: 'mysql' }))).toThrow(
      /protocol/,
    );
  });

  it('rejects a malformed URL', () => {
    expect(() => validateTestDatabaseUrl('not a url')).toThrow(/valid PostgreSQL URL/);
  });

  it('rejects ambiguous or dangerous query parameters', () => {
    for (const param of [
      'port=5433',
      'sslmode=require',
      'options=-csearch_path',
      'host=evil',
      'dbname=x',
      'user=x',
    ]) {
      expect(() => validateTestDatabaseUrl(`${VALID_TEST_URL}?${param}`)).toThrow(/parameter/);
    }
  });

  it('never includes the password or the full URL in errors', () => {
    const canary = ['not-a', 'real', 'password'].join('-');
    let message = '';
    try {
      validateTestDatabaseUrl(buildDatabaseUrl({ hostname: 'db.example.com', password: canary }));
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).not.toContain(canary);
    expect(message).not.toContain('db.example.com');
    expect(message).not.toContain('postgresql://');
  });
});
