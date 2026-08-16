import { EMAIL_MAX_LENGTH } from './password-policy';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function hasControlCharacters(value: string): boolean {
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}

export class EmailValidationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EmailValidationError';
  }
}

/**
 * Centralized email normalization: trim outer whitespace, validate format and
 * length, reject control characters, and lowercase predictably. No provider-
 * specific rules. The value is never included in errors.
 */
export function normalizeEmail(email: string): string {
  if (typeof email !== 'string' || email.length === 0) {
    throw new EmailValidationError('invalid', 'The e-mail is invalid.');
  }
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > EMAIL_MAX_LENGTH) {
    throw new EmailValidationError('invalid_length', 'The e-mail is invalid.');
  }
  if (hasControlCharacters(trimmed)) {
    throw new EmailValidationError('control_characters', 'The e-mail is invalid.');
  }
  if (!EMAIL_PATTERN.test(trimmed)) {
    throw new EmailValidationError('invalid_format', 'The e-mail is invalid.');
  }
  return trimmed.toLowerCase();
}
