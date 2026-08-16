import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

const TOKEN_BYTES = 32;
const TOKEN_HEX_LENGTH = TOKEN_BYTES * 2;
const TOKEN_PATTERN = /^[0-9a-f]{64}$/;

const SESSION_HASH_CONTEXT = 'sess_v1:';
const CSRF_HASH_CONTEXT = 'csrf_v1:';

/**
 * Session and CSRF tokens are independent 32-byte CSPRNG values, hex-encoded
 * (lowercase, exactly 64 characters). They are never derived from each other,
 * never reused, never stored in plaintext, and never logged.
 */
export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

export function generateCsrfToken(): string {
  return randomBytes(TOKEN_BYTES).toString('hex');
}

export function isValidSessionToken(token: string): boolean {
  return (
    typeof token === 'string' && token.length === TOKEN_HEX_LENGTH && TOKEN_PATTERN.test(token)
  );
}

export function isValidCsrfToken(token: string): boolean {
  return (
    typeof token === 'string' && token.length === TOKEN_HEX_LENGTH && TOKEN_PATTERN.test(token)
  );
}

/**
 * Domain-separated SHA-256 hashes. The versioned prefix makes a session token
 * hash never usable as a CSRF token hash (and vice versa) and allows future
 * rehashing without ambiguity. Tokens are high-entropy, so keyless SHA-256 is
 * appropriate (Argon2 is reserved for low-entropy passwords).
 */
export function hashSessionToken(token: string): string {
  return createHash('sha256')
    .update(SESSION_HASH_CONTEXT + token)
    .digest('hex');
}

export function hashCsrfToken(token: string): string {
  return createHash('sha256')
    .update(CSRF_HASH_CONTEXT + token)
    .digest('hex');
}

export function storedSessionHash(token: string): string {
  return SESSION_HASH_CONTEXT + hashSessionToken(token);
}

export function storedCsrfHash(token: string): string {
  return CSRF_HASH_CONTEXT + hashCsrfToken(token);
}

/**
 * Constant-time comparison. Lengths are checked first so mismatched-length
 * inputs never reach timingSafeEqual (which throws on unequal lengths).
 */
export function safeTokenEqual(actual: string, expected: string): boolean {
  const actualBuffer = Buffer.from(actual, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  if (actualBuffer.length !== expectedBuffer.length) {
    return false;
  }
  return timingSafeEqual(actualBuffer, expectedBuffer);
}
