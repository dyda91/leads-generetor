import { describe, expect, it } from '@jest/globals';

import { EnvironmentValidationError, parseEnvironment } from './environment.schema';
import type { EnvironmentIssue } from './environment.types';

function validationErrorFor(
  source: Record<string, string | undefined>,
): EnvironmentValidationError {
  try {
    parseEnvironment(source);
  } catch (error) {
    if (error instanceof EnvironmentValidationError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected environment validation to fail.');
}

function hasIssue(issues: readonly EnvironmentIssue[], field: string, code: string): boolean {
  return issues.some((issue) => issue.field === field && issue.code === code);
}

describe('parseEnvironment', () => {
  const PG_SCHEME = 'postgresql';
  const MYSQL_SCHEME = 'mysql';

  function databaseUrl(options: {
    scheme?: string;
    user: string;
    password: string;
    host: string;
    port: number;
    database: string;
  }): string {
    const scheme = options.scheme ?? PG_SCHEME;
    return `${scheme}://${options.user}:${options.password}@${options.host}:${options.port}/${options.database}`;
  }

  const VALID_DATABASE_URL = databaseUrl({
    user: 'leads',
    password: 'pass',
    host: '127.0.0.1',
    port: 5432,
    database: 'leads',
  });
  const validDev = { NODE_ENV: 'development', PORT: '3000', DATABASE_URL: VALID_DATABASE_URL };

  it('blocks the boot when NODE_ENV is missing', () => {
    const issues = validationErrorFor({ PORT: '3000' }).issues;
    expect(hasIssue(issues, 'NODE_ENV', 'required')).toBe(true);
  });

  it('blocks the boot when NODE_ENV is invalid', () => {
    const issues = validationErrorFor({ NODE_ENV: 'staging', PORT: '3000' }).issues;
    expect(hasIssue(issues, 'NODE_ENV', 'invalid')).toBe(true);
  });

  it('blocks the boot when PORT is missing', () => {
    const issues = validationErrorFor({ NODE_ENV: 'development' }).issues;
    expect(hasIssue(issues, 'PORT', 'required')).toBe(true);
  });

  it('treats an empty PORT as missing', () => {
    const issues = validationErrorFor({ NODE_ENV: 'development', PORT: '' }).issues;
    expect(hasIssue(issues, 'PORT', 'required')).toBe(true);
  });

  it('rejects a non-numeric PORT', () => {
    const issues = validationErrorFor({ NODE_ENV: 'development', PORT: 'abc' }).issues;
    expect(hasIssue(issues, 'PORT', 'invalid')).toBe(true);
  });

  it('rejects a PORT with a numeric suffix', () => {
    const issues = validationErrorFor({ NODE_ENV: 'development', PORT: '3000abc' }).issues;
    expect(hasIssue(issues, 'PORT', 'invalid')).toBe(true);
  });

  it('rejects PORT zero', () => {
    const issues = validationErrorFor({ NODE_ENV: 'development', PORT: '0' }).issues;
    expect(hasIssue(issues, 'PORT', 'out_of_range')).toBe(true);
  });

  it('rejects a negative PORT', () => {
    const issues = validationErrorFor({ NODE_ENV: 'development', PORT: '-1' }).issues;
    expect(hasIssue(issues, 'PORT', 'out_of_range')).toBe(true);
  });

  it('rejects a fractional PORT', () => {
    const issues = validationErrorFor({ NODE_ENV: 'development', PORT: '3000.5' }).issues;
    expect(hasIssue(issues, 'PORT', 'invalid')).toBe(true);
  });

  it('rejects a PORT above 65535', () => {
    const issues = validationErrorFor({ NODE_ENV: 'development', PORT: '65536' }).issues;
    expect(hasIssue(issues, 'PORT', 'out_of_range')).toBe(true);
  });

  it('accepts a valid configuration', () => {
    const environment = parseEnvironment(validDev);
    expect(environment).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      CORS_ORIGINS: [],
      BODY_LIMIT_BYTES: 100_000,
      RATE_LIMIT_TTL_MS: 60_000,
      RATE_LIMIT_MAX: 100,
      SESSION_ABSOLUTE_TTL_MS: 604_800_000,
      SESSION_IDLE_TTL_MS: 1_800_000,
      SESSION_TOUCH_INTERVAL_MS: 300_000,
      ARGON2_MEMORY_COST: 19_456,
      ARGON2_TIME_COST: 2,
      ARGON2_PARALLELISM: 1,
      ARGON2_HASH_LENGTH: 32,
      DATABASE_URL: VALID_DATABASE_URL,
    });
  });

  it('ignores unknown system variables', () => {
    const environment = parseEnvironment({
      ...validDev,
      PATH: '/usr/bin',
      HOME: '/root',
      TERM: 'xterm-256color',
    });
    expect(environment).toEqual({
      NODE_ENV: 'development',
      PORT: 3000,
      CORS_ORIGINS: [],
      BODY_LIMIT_BYTES: 100_000,
      RATE_LIMIT_TTL_MS: 60_000,
      RATE_LIMIT_MAX: 100,
      SESSION_ABSOLUTE_TTL_MS: 604_800_000,
      SESSION_IDLE_TTL_MS: 1_800_000,
      SESSION_TOUCH_INTERVAL_MS: 300_000,
      ARGON2_MEMORY_COST: 19_456,
      ARGON2_TIME_COST: 2,
      ARGON2_PARALLELISM: 1,
      ARGON2_HASH_LENGTH: 32,
      DATABASE_URL: VALID_DATABASE_URL,
    });
  });

  it('blocks the boot when DATABASE_URL is missing', () => {
    const issues = validationErrorFor({ NODE_ENV: 'development', PORT: '3000' }).issues;
    expect(hasIssue(issues, 'DATABASE_URL', 'required')).toBe(true);
  });

  it('blocks the boot when DATABASE_URL is empty', () => {
    const issues = validationErrorFor({ ...validDev, DATABASE_URL: '' }).issues;
    expect(hasIssue(issues, 'DATABASE_URL', 'required')).toBe(true);
  });

  it('blocks the boot when DATABASE_URL is malformed', () => {
    const issues = validationErrorFor({ ...validDev, DATABASE_URL: 'not a url' }).issues;
    expect(hasIssue(issues, 'DATABASE_URL', 'invalid')).toBe(true);
  });

  it('blocks the boot when DATABASE_URL uses a non-PostgreSQL protocol', () => {
    const issues = validationErrorFor({
      ...validDev,
      DATABASE_URL: databaseUrl({
        scheme: MYSQL_SCHEME,
        user: 'u',
        password: 'p',
        host: '127.0.0.1',
        port: 3306,
        database: 'db',
      }),
    }).issues;
    expect(hasIssue(issues, 'DATABASE_URL', 'invalid')).toBe(true);
  });

  it('never includes the DATABASE_URL value or password in errors', () => {
    const issues = validationErrorFor({
      ...validDev,
      DATABASE_URL: databaseUrl({
        scheme: MYSQL_SCHEME,
        user: 'leads',
        password: 'super-secret-pw',
        host: '127.0.0.1',
        port: 5432,
        database: 'leads',
      }),
    }).issues;
    const serialized = JSON.stringify(issues);
    expect(serialized).not.toContain('super-secret-pw');
    expect(serialized).not.toContain('mysql://');
    expect(serialized).not.toContain('leads:super');
  });

  it('does not require GOOGLE_PLACES_API_KEY yet', () => {
    expect(() => parseEnvironment(validDev)).not.toThrow();
  });

  it('includes the safe field name in the error', () => {
    const error = validationErrorFor({ NODE_ENV: 'development', PORT: '3000abc' });
    expect(error.message).toContain('PORT');
    expect(hasIssue(error.issues, 'PORT', 'invalid')).toBe(true);
  });

  it('never includes the received value in the error', () => {
    const error = validationErrorFor({ NODE_ENV: 'development', PORT: '3000abc' });
    expect(error.message).not.toContain('3000abc');
    expect(JSON.stringify(error.issues)).not.toContain('3000abc');
  });

  it('never dumps the environment in the error', () => {
    const error = validationErrorFor({
      NODE_ENV: 'development',
      PORT: '3000abc',
      PATH: '/usr/bin',
      HOME: '/root',
    });
    expect(error.message).not.toContain('/usr/bin');
    expect(error.message).not.toContain('/root');
    expect(JSON.stringify(error.issues)).not.toContain('PATH');
    expect(JSON.stringify(error.issues)).not.toContain('HOME');
  });

  it('rejects a CORS wildcard in production', () => {
    const issues = validationErrorFor({
      NODE_ENV: 'production',
      PORT: '443',
      CORS_ORIGINS: '*',
      DATABASE_URL: VALID_DATABASE_URL,
    }).issues;
    expect(hasIssue(issues, 'CORS_ORIGINS', 'wildcard_forbidden_in_production')).toBe(true);
  });

  it('rejects a CORS wildcard in development', () => {
    const issues = validationErrorFor({
      NODE_ENV: 'development',
      PORT: '3000',
      CORS_ORIGINS: '*',
      DATABASE_URL: VALID_DATABASE_URL,
    }).issues;
    expect(hasIssue(issues, 'CORS_ORIGINS', 'invalid')).toBe(true);
  });

  it('rejects an HTTP origin in production', () => {
    const issues = validationErrorFor({
      NODE_ENV: 'production',
      PORT: '443',
      CORS_ORIGINS: 'http://app.example.com',
      DATABASE_URL: VALID_DATABASE_URL,
    }).issues;
    expect(hasIssue(issues, 'CORS_ORIGINS', 'https_required_in_production')).toBe(true);
  });

  it('rejects the special null origin', () => {
    const issues = validationErrorFor({
      NODE_ENV: 'test',
      PORT: '3000',
      CORS_ORIGINS: 'null',
      DATABASE_URL: VALID_DATABASE_URL,
    }).issues;
    expect(hasIssue(issues, 'CORS_ORIGINS', 'invalid')).toBe(true);
  });

  it('rejects empty entries between CORS separators', () => {
    const issues = validationErrorFor({
      NODE_ENV: 'test',
      PORT: '3000',
      CORS_ORIGINS: 'https://a.example.com,,https://b.example.com',
      DATABASE_URL: VALID_DATABASE_URL,
    }).issues;
    expect(hasIssue(issues, 'CORS_ORIGINS', 'invalid')).toBe(true);
  });

  it('rejects CORS origins with credentials, query, fragment or path', () => {
    const userinfoOrigin = `https://user:pass${'@a.example.com'}`;
    for (const origin of [
      userinfoOrigin,
      'https://a.example.com?x=1',
      'https://a.example.com#frag',
      'https://a.example.com/path',
    ]) {
      const issues = validationErrorFor({
        NODE_ENV: 'test',
        PORT: '3000',
        CORS_ORIGINS: origin,
        DATABASE_URL: VALID_DATABASE_URL,
      }).issues;
      expect(hasIssue(issues, 'CORS_ORIGINS', 'invalid')).toBe(true);
    }
  });

  it('normalizes and deduplicates CORS origins', () => {
    const environment = parseEnvironment({
      NODE_ENV: 'test',
      PORT: '3000',
      CORS_ORIGINS: 'https://App.Example.com:443, https://a.example.com, https://app.example.com',
      DATABASE_URL: VALID_DATABASE_URL,
    });
    expect(environment.CORS_ORIGINS).toEqual(['https://app.example.com', 'https://a.example.com']);
  });

  it('applies the default body limit when absent', () => {
    const environment = parseEnvironment(validDev);
    expect(environment.BODY_LIMIT_BYTES).toBe(100_000);
  });

  it('accepts an explicit body limit within range', () => {
    const environment = parseEnvironment({ ...validDev, BODY_LIMIT_BYTES: '250000' });
    expect(environment.BODY_LIMIT_BYTES).toBe(250_000);
  });

  it('rejects a non-numeric body limit', () => {
    const issues = validationErrorFor({ ...validDev, BODY_LIMIT_BYTES: 'abc' }).issues;
    expect(hasIssue(issues, 'BODY_LIMIT_BYTES', 'invalid')).toBe(true);
  });

  it('rejects a fractional body limit', () => {
    const issues = validationErrorFor({ ...validDev, BODY_LIMIT_BYTES: '100.5' }).issues;
    expect(hasIssue(issues, 'BODY_LIMIT_BYTES', 'invalid')).toBe(true);
  });

  it('rejects a body limit above the maximum', () => {
    for (const value of ['2000000', '20000000']) {
      const issues = validationErrorFor({ ...validDev, BODY_LIMIT_BYTES: value }).issues;
      expect(hasIssue(issues, 'BODY_LIMIT_BYTES', 'out_of_range')).toBe(true);
    }
  });

  it('applies the default rate limit when absent', () => {
    const environment = parseEnvironment(validDev);
    expect(environment.RATE_LIMIT_MAX).toBe(100);
    expect(environment.RATE_LIMIT_TTL_MS).toBe(60_000);
  });

  it('accepts explicit rate limit values', () => {
    const environment = parseEnvironment({
      ...validDev,
      RATE_LIMIT_TTL_MS: '30000',
      RATE_LIMIT_MAX: '50',
    });
    expect(environment.RATE_LIMIT_TTL_MS).toBe(30_000);
    expect(environment.RATE_LIMIT_MAX).toBe(50);
  });

  it('rejects invalid rate limit values', () => {
    for (const [field, value] of [
      ['RATE_LIMIT_TTL_MS', '0'],
      ['RATE_LIMIT_TTL_MS', '-1'],
      ['RATE_LIMIT_TTL_MS', 'abc'],
      ['RATE_LIMIT_TTL_MS', '100.5'],
      ['RATE_LIMIT_TTL_MS', '1000abc'],
      ['RATE_LIMIT_TTL_MS', '4000000'],
      ['RATE_LIMIT_TTL_MS', '500'],
      ['RATE_LIMIT_MAX', '0'],
      ['RATE_LIMIT_MAX', '-1'],
      ['RATE_LIMIT_MAX', 'abc'],
      ['RATE_LIMIT_MAX', '10.5'],
      ['RATE_LIMIT_MAX', '100abc'],
      ['RATE_LIMIT_MAX', '20000'],
    ] as const) {
      const issues = validationErrorFor({ ...validDev, [field]: value }).issues;
      expect(issues.some((issue) => issue.field === field)).toBe(true);
    }
  });

  it('rejects a rate limit that would be ineffective in production', () => {
    const issues = validationErrorFor({
      NODE_ENV: 'production',
      PORT: '443',
      RATE_LIMIT_MAX: '2000',
      DATABASE_URL: VALID_DATABASE_URL,
    }).issues;
    expect(hasIssue(issues, 'RATE_LIMIT_MAX', 'rate_limit_production_ineffective')).toBe(true);
  });

  it('accepts a rate limit at the production cap', () => {
    const environment = parseEnvironment({
      NODE_ENV: 'production',
      PORT: '443',
      RATE_LIMIT_MAX: '1000',
      DATABASE_URL: VALID_DATABASE_URL,
    });
    expect(environment.RATE_LIMIT_MAX).toBe(1000);
  });

  it('applies the default session TTLs when absent', () => {
    const environment = parseEnvironment(validDev);
    expect(environment.SESSION_ABSOLUTE_TTL_MS).toBe(604_800_000);
    expect(environment.SESSION_IDLE_TTL_MS).toBe(1_800_000);
    expect(environment.SESSION_TOUCH_INTERVAL_MS).toBe(300_000);
  });

  it('accepts explicit session TTL values', () => {
    const environment = parseEnvironment({
      ...validDev,
      SESSION_ABSOLUTE_TTL_MS: '3600000',
      SESSION_IDLE_TTL_MS: '300000',
      SESSION_TOUCH_INTERVAL_MS: '60000',
    });
    expect(environment.SESSION_ABSOLUTE_TTL_MS).toBe(3_600_000);
    expect(environment.SESSION_IDLE_TTL_MS).toBe(300_000);
    expect(environment.SESSION_TOUCH_INTERVAL_MS).toBe(60_000);
  });

  it('rejects invalid or out-of-range session TTL values', () => {
    for (const [field, value] of [
      ['SESSION_ABSOLUTE_TTL_MS', '0'],
      ['SESSION_ABSOLUTE_TTL_MS', '-1'],
      ['SESSION_ABSOLUTE_TTL_MS', 'abc'],
      ['SESSION_ABSOLUTE_TTL_MS', '100.5'],
      ['SESSION_ABSOLUTE_TTL_MS', '3600000abc'],
      ['SESSION_ABSOLUTE_TTL_MS', '3599999'],
      ['SESSION_ABSOLUTE_TTL_MS', '2592000001'],
      ['SESSION_IDLE_TTL_MS', '0'],
      ['SESSION_IDLE_TTL_MS', '-1'],
      ['SESSION_IDLE_TTL_MS', 'abc'],
      ['SESSION_IDLE_TTL_MS', '10.5'],
      ['SESSION_IDLE_TTL_MS', '300000abc'],
      ['SESSION_IDLE_TTL_MS', '299999'],
      ['SESSION_IDLE_TTL_MS', '86400001'],
      ['SESSION_TOUCH_INTERVAL_MS', '0'],
      ['SESSION_TOUCH_INTERVAL_MS', '-1'],
      ['SESSION_TOUCH_INTERVAL_MS', 'abc'],
      ['SESSION_TOUCH_INTERVAL_MS', '1.5'],
      ['SESSION_TOUCH_INTERVAL_MS', '60000abc'],
      ['SESSION_TOUCH_INTERVAL_MS', '59999'],
      ['SESSION_TOUCH_INTERVAL_MS', '3600001'],
    ] as const) {
      const issues = validationErrorFor({ ...validDev, [field]: value }).issues;
      expect(issues.some((issue) => issue.field === field)).toBe(true);
    }
  });

  it('rejects an idle TTL greater than or equal to the absolute TTL', () => {
    const issues = validationErrorFor({
      ...validDev,
      SESSION_ABSOLUTE_TTL_MS: '3600000',
      SESSION_IDLE_TTL_MS: '3600000',
    }).issues;
    expect(hasIssue(issues, 'SESSION_IDLE_TTL_MS', 'session_idle_must_be_less_than_absolute')).toBe(
      true,
    );
  });

  it('rejects a touch interval greater than or equal to the idle TTL', () => {
    const issues = validationErrorFor({
      ...validDev,
      SESSION_IDLE_TTL_MS: '300000',
      SESSION_TOUCH_INTERVAL_MS: '300000',
    }).issues;
    expect(
      hasIssue(issues, 'SESSION_TOUCH_INTERVAL_MS', 'session_touch_must_be_less_than_idle'),
    ).toBe(true);
  });

  it('keeps session TTL error messages free of values', () => {
    const error = validationErrorFor({
      ...validDev,
      SESSION_ABSOLUTE_TTL_MS: '3600000',
      SESSION_IDLE_TTL_MS: '3600000',
      SESSION_TOUCH_INTERVAL_MS: '999999999',
    });
    expect(error.message).not.toContain('3600000');
    expect(error.message).not.toContain('999999999');
    expect(JSON.stringify(error.issues)).not.toContain('3600000');
  });

  it('accepts the maximum Argon2 values', () => {
    const environment = parseEnvironment({
      ...validDev,
      ARGON2_MEMORY_COST: '262144',
      ARGON2_TIME_COST: '5',
      ARGON2_PARALLELISM: '4',
      ARGON2_HASH_LENGTH: '64',
    });
    expect(environment.ARGON2_MEMORY_COST).toBe(262_144);
    expect(environment.ARGON2_TIME_COST).toBe(5);
    expect(environment.ARGON2_PARALLELISM).toBe(4);
    expect(environment.ARGON2_HASH_LENGTH).toBe(64);
  });

  it('rejects an Argon2 value above the maximum', () => {
    for (const [field, value] of [
      ['ARGON2_MEMORY_COST', '262145'],
      ['ARGON2_TIME_COST', '6'],
      ['ARGON2_PARALLELISM', '5'],
      ['ARGON2_HASH_LENGTH', '65'],
    ] as const) {
      const issues = validationErrorFor({ ...validDev, [field]: value }).issues;
      expect(hasIssue(issues, field, 'out_of_range')).toBe(true);
    }
  });

  it('rejects an Argon2 value below the minimum', () => {
    for (const [field, value] of [
      ['ARGON2_MEMORY_COST', '19455'],
      ['ARGON2_TIME_COST', '1'],
      ['ARGON2_PARALLELISM', '0'],
      ['ARGON2_HASH_LENGTH', '15'],
    ] as const) {
      const issues = validationErrorFor({ ...validDev, [field]: value }).issues;
      expect(hasIssue(issues, field, 'out_of_range')).toBe(true);
    }
  });

  it('keeps Argon2 default values when absent', () => {
    const environment = parseEnvironment(validDev);
    expect(environment.ARGON2_MEMORY_COST).toBe(19_456);
    expect(environment.ARGON2_TIME_COST).toBe(2);
    expect(environment.ARGON2_PARALLELISM).toBe(1);
    expect(environment.ARGON2_HASH_LENGTH).toBe(32);
  });

  it('keeps Argon2 error messages free of values', () => {
    const error = validationErrorFor({
      ...validDev,
      ARGON2_MEMORY_COST: '262145',
      ARGON2_TIME_COST: '999999',
    });
    expect(error.message).not.toContain('262145');
    expect(error.message).not.toContain('999999');
    expect(JSON.stringify(error.issues)).not.toContain('262145');
    expect(JSON.stringify(error.issues)).not.toContain('999999');
  });
});
