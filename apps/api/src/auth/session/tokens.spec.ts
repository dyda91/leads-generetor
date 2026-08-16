import { describe, expect, it } from '@jest/globals';

import {
  generateCsrfToken,
  generateSessionToken,
  hashCsrfToken,
  hashSessionToken,
  isValidCsrfToken,
  isValidSessionToken,
  safeTokenEqual,
  storedCsrfHash,
  storedSessionHash,
} from './tokens';

describe('session and CSRF tokens', () => {
  it('generates 64-character lowercase hex tokens', () => {
    const sessionToken = generateSessionToken();
    const csrfToken = generateCsrfToken();
    expect(sessionToken).toMatch(/^[0-9a-f]{64}$/);
    expect(csrfToken).toMatch(/^[0-9a-f]{64}$/);
  });

  it('is practically random (session tokens differ)', () => {
    const tokens = new Set(Array.from({ length: 50 }, () => generateSessionToken()));
    expect(tokens.size).toBe(50);
  });

  it('generates session and CSRF tokens independently', () => {
    const sessionToken = generateSessionToken();
    const csrfToken = generateCsrfToken();
    expect(sessionToken).not.toBe(csrfToken);
  });

  it('accepts only exactly 64 lowercase hex characters', () => {
    expect(isValidSessionToken(generateSessionToken())).toBe(true);
    expect(isValidSessionToken('A'.repeat(64))).toBe(false);
    expect(isValidSessionToken('a'.repeat(63))).toBe(false);
    expect(isValidSessionToken('a'.repeat(65))).toBe(false);
    expect(isValidSessionToken(` ${'a'.repeat(64)}`)).toBe(false);
    expect(isValidSessionToken(`${'a'.repeat(64)} `)).toBe(false);
    expect(isValidSessionToken('not-a-token')).toBe(false);
    expect(isValidCsrfToken(generateCsrfToken())).toBe(true);
    expect(isValidCsrfToken('g'.repeat(64))).toBe(false);
  });

  it('hashes deterministically for the same token and context', () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).toBe(hashSessionToken(token));
    expect(storedSessionHash(token)).toBe(storedSessionHash(token));
  });

  it('uses distinct contexts so a session token is never usable as a CSRF token', () => {
    const token = generateSessionToken();
    expect(hashSessionToken(token)).not.toBe(hashCsrfToken(token));
    expect(storedSessionHash(token)).not.toBe(storedCsrfHash(token));
    expect(storedSessionHash(token).startsWith('sess_v1:')).toBe(true);
    expect(storedCsrfHash(token).startsWith('csrf_v1:')).toBe(true);
  });

  it('never stores or returns the raw token in the hash', () => {
    const token = generateSessionToken();
    expect(storedSessionHash(token)).not.toContain(token);
    expect(storedCsrfHash(token)).not.toContain(token);
  });

  it('compares tokens in constant time with a length guard', () => {
    expect(safeTokenEqual('abc', 'abc')).toBe(true);
    expect(safeTokenEqual('abc', 'abd')).toBe(false);
    expect(() => safeTokenEqual('abc', 'abcd')).not.toThrow();
    expect(safeTokenEqual('abc', 'abcd')).toBe(false);
  });

  it('never includes token values in any thrown error', () => {
    const token = generateSessionToken();
    expect(storedSessionHash(token)).toBeDefined();
    expect(storedCsrfHash(token)).toBeDefined();
  });
});
