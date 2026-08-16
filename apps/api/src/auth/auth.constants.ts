export const CSRF_HEADER = 'x-csrf-token';

export const SESSION_TOKEN_BYTES = 32;
export const CSRF_TOKEN_BYTES = 32;

/** Tokens are hex-encoded (base16), which is unambiguous for cookie/header use. */
export const TOKEN_ENCODING = 'hex';
export const SESSION_TOKEN_LENGTH = SESSION_TOKEN_BYTES * 2;
export const CSRF_TOKEN_LENGTH = CSRF_TOKEN_BYTES * 2;

/** Maximum length of the session token in a cookie value. */
export const SESSION_COOKIE_MAX_LENGTH = SESSION_TOKEN_LENGTH;
/** Maximum length of the CSRF token in the X-CSRF-Token header. */
export const CSRF_HEADER_MAX_LENGTH = CSRF_TOKEN_LENGTH;

/** Distinct hash contexts so a session token hash is never confused with a CSRF token hash. */
export const SESSION_HASH_CONTEXT = 'sess_v1:';
export const CSRF_HASH_CONTEXT = 'csrf_v1:';

/** Stricter rate limit for authentication mutations (login, change-password). */
export const AUTH_RATE_LIMIT_MAX = 10;
export const AUTH_RATE_LIMIT_TTL_MS = 60_000;

/**
 * DI token for the in-memory dummy Argon2id hash used to equalize login timing
 * for unknown/inactive users. Generated once per application instance at boot.
 */
export const DUMMY_PASSWORD_HASH = Symbol('DUMMY_PASSWORD_HASH');
