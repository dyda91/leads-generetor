export const PASSWORD_MIN_LENGTH = 12;
export const PASSWORD_MAX_LENGTH = 128;
export const PASSWORD_MAX_UTF8_BYTES = 512;
export const EMAIL_MAX_LENGTH = 254;

export class PasswordPolicyError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PasswordPolicyError';
  }
}

/**
 * Creation password policy (length-based, no arbitrary character rules). The
 * password is never trimmed, lowercased, or Unicode-normalized. Never includes
 * the password value in errors. This is the policy for creating a password;
 * login/verify only require a technically valid string within the maximum.
 */
export function assertPasswordPolicy(password: string): void {
  if (password.length < PASSWORD_MIN_LENGTH) {
    throw new PasswordPolicyError('too_short', 'The password must be at least 12 characters.');
  }
  if (password.length > PASSWORD_MAX_LENGTH) {
    throw new PasswordPolicyError('too_long', 'The password must not exceed 128 characters.');
  }
  if (Buffer.byteLength(password, 'utf8') > PASSWORD_MAX_UTF8_BYTES) {
    throw new PasswordPolicyError(
      'too_long_bytes',
      'The password must not exceed 512 UTF-8 bytes.',
    );
  }
  if (password.trim().length === 0) {
    throw new PasswordPolicyError(
      'whitespace_only',
      'The password must not consist only of spaces.',
    );
  }
}
