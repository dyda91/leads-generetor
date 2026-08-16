export class SessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SessionError';
  }
}

export class InvalidSessionTokenError extends SessionError {
  constructor() {
    super('The session token is invalid.');
    this.name = 'InvalidSessionTokenError';
  }
}

export class InvalidSessionError extends SessionError {
  constructor() {
    super('The session is invalid.');
    this.name = 'InvalidSessionError';
  }
}

export class UserNotActiveError extends SessionError {
  constructor() {
    super('The user is not active.');
    this.name = 'UserNotActiveError';
  }
}

export class SessionConflictError extends SessionError {
  constructor() {
    super('A session conflict occurred.');
    this.name = 'SessionConflictError';
  }
}

export function isUniqueConstraintError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
