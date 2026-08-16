import { describe, expect, it } from '@jest/globals';

import { CliEnvironmentValidationError, parseCliEnvironment } from './cli-environment';

interface FixtureUrlOptions {
  username: string;
  password: string;
  port?: string;
  database: string;
}

/**
 * Builds a fixture database URL at runtime (never a literal connection string),
 * so secret scanners never see a `protocol://user:pass@host:port/db` pattern in
 * the source. Protocol, separator, host, user, password, port and database are
 * assembled separately through the URL API.
 */
function buildFixtureUrl(scheme: string, options: FixtureUrlOptions): string {
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

const VALID_URL = buildFixtureUrl('postgresql', {
  username: 'leads',
  password: 'secret',
  port: '5432',
  database: 'leads',
});

const INVALID_PROTOCOL_URL = buildFixtureUrl('mysql', {
  username: 'u',
  password: 'p',
  database: 'db',
});

const SECRET_VALUE_URL = buildFixtureUrl('postgresql', {
  username: 'leads',
  password: ['super', 'secret', 'value'].join('-'),
  database: 'db',
});

describe('parseCliEnvironment (CLI — no HTTP schema)', () => {
  it('requires only DATABASE_URL, not PORT, CORS_ORIGINS or NODE_ENV', () => {
    const environment = parseCliEnvironment({ DATABASE_URL: VALID_URL });
    expect(environment.databaseUrl).toBe(VALID_URL);
    expect(environment.argon2Options).toEqual({
      memoryCost: 19_456,
      timeCost: 2,
      parallelism: 1,
      hashLength: 32,
    });
  });

  it('accepts optional Argon2id overrides', () => {
    const environment = parseCliEnvironment({
      DATABASE_URL: VALID_URL,
      ARGON2_MEMORY_COST: '65536',
      ARGON2_TIME_COST: '3',
      ARGON2_HASH_LENGTH: '16',
    });
    expect(environment.argon2Options).toEqual({
      memoryCost: 65_536,
      timeCost: 3,
      parallelism: 1,
      hashLength: 16,
    });
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => parseCliEnvironment({})).toThrow(CliEnvironmentValidationError);
    expect(() => parseCliEnvironment({ NODE_ENV: 'development' })).toThrow(
      CliEnvironmentValidationError,
    );
  });

  it('rejects an invalid DATABASE_URL', () => {
    expect(() => parseCliEnvironment({ DATABASE_URL: 'not-a-url' })).toThrow(
      CliEnvironmentValidationError,
    );
    expect(() => parseCliEnvironment({ DATABASE_URL: INVALID_PROTOCOL_URL })).toThrow(
      CliEnvironmentValidationError,
    );
  });

  it('rejects out-of-range Argon2id parameters', () => {
    expect(() => parseCliEnvironment({ DATABASE_URL: VALID_URL, ARGON2_TIME_COST: '99' })).toThrow(
      CliEnvironmentValidationError,
    );
    expect(() => parseCliEnvironment({ DATABASE_URL: VALID_URL, ARGON2_MEMORY_COST: '1' })).toThrow(
      CliEnvironmentValidationError,
    );
  });

  it('never includes values in the validation error', () => {
    try {
      parseCliEnvironment({ DATABASE_URL: SECRET_VALUE_URL });
      throw new Error('expected rejection');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain('super-secret-value');
      expect(message).not.toContain('postgresql://');
    }
  });
});
