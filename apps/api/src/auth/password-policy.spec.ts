import { describe, expect, it } from '@jest/globals';

import { PasswordPolicyError, assertPasswordPolicy } from './password-policy';

function policyErrorFor(password: string): PasswordPolicyError {
  try {
    assertPasswordPolicy(password);
  } catch (error) {
    if (error instanceof PasswordPolicyError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected password policy validation to fail.');
}

describe('assertPasswordPolicy', () => {
  it('accepts a password of exactly the minimum length', () => {
    expect(() => assertPasswordPolicy('a'.repeat(12))).not.toThrow();
  });

  it('rejects a password below the minimum length', () => {
    expect(policyErrorFor('a'.repeat(11)).code).toBe('too_short');
  });

  it('accepts a password of exactly the maximum length', () => {
    expect(() => assertPasswordPolicy('a'.repeat(128))).not.toThrow();
  });

  it('rejects a password above the maximum length', () => {
    expect(policyErrorFor('a'.repeat(129)).code).toBe('too_long');
  });

  it('accepts a password with multi-byte characters within the byte limit', () => {
    // 64 '😀' = 128 UTF-16 units (at the character limit) and 256 UTF-8 bytes.
    const dense = '😀'.repeat(64);
    expect(dense.length).toBe(128);
    expect(Buffer.byteLength(dense, 'utf8')).toBe(256);
    expect(() => assertPasswordPolicy(dense)).not.toThrow();
  });

  it('rejects a password that is only whitespace', () => {
    expect(policyErrorFor(' '.repeat(12)).code).toBe('whitespace_only');
    expect(policyErrorFor('\t'.repeat(12)).code).toBe('whitespace_only');
  });

  it('allows spaces as part of a password', () => {
    expect(() => assertPasswordPolicy('a-password-with  spaces')).not.toThrow();
  });

  it('does not trim or normalize the password', () => {
    const password = '  a-strong-password  ';
    expect(() => assertPasswordPolicy(password)).not.toThrow();
  });

  it('never includes the password value in errors', () => {
    const error = policyErrorFor('x'.repeat(129));
    expect(error.message).not.toContain('x'.repeat(129));
    expect(error.message).not.toContain('xxx');
  });
});
