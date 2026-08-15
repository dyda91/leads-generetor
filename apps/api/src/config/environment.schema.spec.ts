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
  const validDev = { NODE_ENV: 'development', PORT: '3000' };

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
    });
  });

  it('does not require DATABASE_URL yet', () => {
    expect(() => parseEnvironment(validDev)).not.toThrow();
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
    }).issues;
    expect(hasIssue(issues, 'CORS_ORIGINS', 'wildcard_forbidden_in_production')).toBe(true);
  });

  it('rejects a CORS wildcard in development', () => {
    const issues = validationErrorFor({
      NODE_ENV: 'development',
      PORT: '3000',
      CORS_ORIGINS: '*',
    }).issues;
    expect(hasIssue(issues, 'CORS_ORIGINS', 'invalid')).toBe(true);
  });

  it('rejects an HTTP origin in production', () => {
    const issues = validationErrorFor({
      NODE_ENV: 'production',
      PORT: '443',
      CORS_ORIGINS: 'http://app.example.com',
    }).issues;
    expect(hasIssue(issues, 'CORS_ORIGINS', 'https_required_in_production')).toBe(true);
  });

  it('rejects the special null origin', () => {
    const issues = validationErrorFor({
      NODE_ENV: 'test',
      PORT: '3000',
      CORS_ORIGINS: 'null',
    }).issues;
    expect(hasIssue(issues, 'CORS_ORIGINS', 'invalid')).toBe(true);
  });

  it('rejects empty entries between CORS separators', () => {
    const issues = validationErrorFor({
      NODE_ENV: 'test',
      PORT: '3000',
      CORS_ORIGINS: 'https://a.example.com,,https://b.example.com',
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
      }).issues;
      expect(hasIssue(issues, 'CORS_ORIGINS', 'invalid')).toBe(true);
    }
  });

  it('normalizes and deduplicates CORS origins', () => {
    const environment = parseEnvironment({
      NODE_ENV: 'test',
      PORT: '3000',
      CORS_ORIGINS: 'https://App.Example.com:443, https://a.example.com, https://app.example.com',
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
});
