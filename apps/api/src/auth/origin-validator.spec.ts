import { describe, expect, it } from '@jest/globals';

import { OriginRejectedError, OriginValidator } from './origin-validator';

const ALLOWED_ORIGINS = new Set(['https://app.example.com']);

describe('OriginValidator (authentication mutations require an exact Origin)', () => {
  const validator = new OriginValidator(ALLOWED_ORIGINS);

  it('accepts an exact allowed origin', () => {
    expect(validator.validate('https://app.example.com', undefined)).toBe(
      'https://app.example.com',
    );
  });

  it('accepts an origin with a trailing slash, normalized via URL parsing', () => {
    expect(validator.validate('https://app.example.com/', undefined)).toBe(
      'https://app.example.com',
    );
  });

  it('accepts an allowed referer that agrees with the origin', () => {
    expect(validator.validate('https://app.example.com', 'https://app.example.com/login')).toBe(
      'https://app.example.com',
    );
  });

  it('rejects a missing Origin', () => {
    expect(() => validator.validate(undefined, undefined)).toThrow(OriginRejectedError);
  });

  it('rejects an empty Origin', () => {
    expect(() => validator.validate('', undefined)).toThrow(OriginRejectedError);
  });

  it('rejects the literal null origin', () => {
    expect(() => validator.validate('null', undefined)).toThrow(OriginRejectedError);
  });

  it('rejects a malformed Origin', () => {
    expect(() => validator.validate('not-a-url', undefined)).toThrow(OriginRejectedError);
    expect(() => validator.validate('https://', undefined)).toThrow(OriginRejectedError);
  });

  it('rejects a disallowed Origin', () => {
    expect(() => validator.validate('https://evil.example.com', undefined)).toThrow(
      OriginRejectedError,
    );
  });

  it('rejects a look-alike Origin', () => {
    expect(() => validator.validate('https://app.example.com.evil.com', undefined)).toThrow(
      OriginRejectedError,
    );
  });

  it('rejects an Origin with a different port', () => {
    expect(() => validator.validate('https://app.example.com:8443', undefined)).toThrow(
      OriginRejectedError,
    );
  });

  it('rejects a Referer that disagrees with the Origin', () => {
    expect(() =>
      validator.validate('https://app.example.com', 'https://other.example.com/page'),
    ).toThrow(OriginRejectedError);
  });

  it('never accepts a Referer as a substitute for a missing Origin', () => {
    expect(() => validator.validate(undefined, 'https://app.example.com/page')).toThrow(
      OriginRejectedError,
    );
  });

  it('rejects a Referer whose origin is not the allowed one', () => {
    expect(() =>
      validator.validate('https://app.example.com', 'https://app.example.com.evil.com/x'),
    ).toThrow(OriginRejectedError);
  });
});
