import { describe, expect, it } from '@jest/globals';

import { EmailValidationError, normalizeEmail } from './email';

function emailErrorFor(email: string): EmailValidationError {
  try {
    normalizeEmail(email);
  } catch (error) {
    if (error instanceof EmailValidationError) {
      return error;
    }
    throw error;
  }
  throw new Error('Expected e-mail validation to fail.');
}

describe('normalizeEmail', () => {
  it('trims outer whitespace and lowercases predictably', () => {
    expect(normalizeEmail('  Admin@Example.COM  ')).toBe('admin@example.com');
    expect(normalizeEmail('Admin@Example.COM')).toBe('admin@example.com');
  });

  it('accepts a valid lowercase e-mail unchanged', () => {
    expect(normalizeEmail('admin@example.com')).toBe('admin@example.com');
  });

  it('rejects an e-mail without an @', () => {
    expect(emailErrorFor('admin.example.com').code).toBe('invalid_format');
  });

  it('rejects an e-mail without a domain', () => {
    expect(emailErrorFor('admin@example').code).toBe('invalid_format');
  });

  it('rejects whitespace inside the address', () => {
    expect(emailErrorFor('ad min@example.com').code).toBe('invalid_format');
  });

  it('rejects control characters', () => {
    expect(emailErrorFor('ad\u0000min@example.com').code).toBe('control_characters');
  });

  it('rejects an oversized e-mail', () => {
    const long = `${'a'.repeat(250)}@example.com`;
    expect(emailErrorFor(long).code).toBe('invalid_length');
  });

  it('rejects an empty or whitespace-only e-mail', () => {
    expect(emailErrorFor('').code).toBe('invalid');
    expect(emailErrorFor('   ').code).toBe('invalid_length');
  });

  it('never includes the e-mail value in errors', () => {
    const error = emailErrorFor(`admin@${'x'.repeat(260)}.com`);
    expect(error.message).not.toContain('admin@');
    expect(error.message).not.toContain('x'.repeat(260));
  });
});
