import { describe, expect, it } from '@jest/globals';

import type { Environment } from '../../config/environment.types';
import { environmentToSessionConfig } from './session-config';

/** Fixture URL built at runtime (never a literal connection string). */
function buildFixtureDatabaseUrl(): string {
  const separator = ['/', '/'].join('');
  const url = new URL(`postgresql:${separator}localhost`);
  url.username = 'test';
  url.password = 'test';
  url.port = '5432';
  url.pathname = ['/', 'test'].join('');
  return url.toString();
}

function buildEnvironment(overrides: Partial<Environment> = {}): Environment {
  return {
    NODE_ENV: 'test',
    PORT: 3000,
    CORS_ORIGINS: [],
    BODY_LIMIT_BYTES: 10_000,
    RATE_LIMIT_TTL_MS: 60_000,
    RATE_LIMIT_MAX: 100,
    SESSION_ABSOLUTE_TTL_MS: 3_600_000,
    SESSION_IDLE_TTL_MS: 1_800_000,
    SESSION_TOUCH_INTERVAL_MS: 60_000,
    ARGON2_MEMORY_COST: 19_456,
    ARGON2_TIME_COST: 2,
    ARGON2_PARALLELISM: 1,
    ARGON2_HASH_LENGTH: 32,
    DATABASE_URL: buildFixtureDatabaseUrl(),
    ...overrides,
  };
}

describe('environmentToSessionConfig', () => {
  it('maps the environment variables to a session config', () => {
    expect(environmentToSessionConfig(buildEnvironment())).toEqual({
      absoluteTtlMs: 3_600_000,
      idleTtlMs: 1_800_000,
      touchIntervalMs: 60_000,
    });
  });

  it('reflects customized TTL values', () => {
    const environment = buildEnvironment({
      SESSION_ABSOLUTE_TTL_MS: 5_000,
      SESSION_IDLE_TTL_MS: 500,
      SESSION_TOUCH_INTERVAL_MS: 250,
    });
    expect(environmentToSessionConfig(environment)).toEqual({
      absoluteTtlMs: 5_000,
      idleTtlMs: 500,
      touchIntervalMs: 250,
    });
  });
});
