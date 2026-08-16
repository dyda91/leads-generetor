/**
 * Safe post-login destinations. Only exact internal paths that already exist in
 * the routing tree are accepted; anything else falls back to `/`. The
 * destination is read ONLY from controlled `location.state` (never from a query
 * string) and validated structurally. No e-mail, password, CSRF, cookie, full
 * user object or error is ever stored in `location.state`.
 */
export const ALLOWED_DESTINATIONS = ['/', '/settings/security'] as const;

export type AllowedDestination = (typeof ALLOWED_DESTINATIONS)[number];

const HOME: AllowedDestination = '/';

function containsControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code < 0x20 || code === 0x7f) {
      return true;
    }
  }
  return false;
}

function hasBackslash(value: string): boolean {
  return value.includes('\\');
}

function hasUrlScheme(value: string): boolean {
  // Matches `scheme:` at the start: http:, https:, javascript:, data:, etc.
  return /^[a-z][a-z0-9+.-]*:/i.test(value);
}

function isProtocolRelativeHost(value: string): boolean {
  return value.startsWith('//');
}

function isExactAllowedPath(value: string): value is AllowedDestination {
  return (ALLOWED_DESTINATIONS as readonly string[]).includes(value);
}

/**
 * Resolves a post-login destination from the router `location.state`.
 *
 * Only a plain object carrying a string `from` that exactly matches an allowed
 * path is honored. Absolute URLs, `//host`, `javascript:`, `data:`,
 * backslashes, control characters, unknown paths, tampered objects and any
 * query-string destination are rejected and resolve to `/`.
 */
export function resolvePostLoginDestination(state: unknown): AllowedDestination {
  if (typeof state !== 'object' || state === null) {
    return HOME;
  }
  const candidate = (state as { from?: unknown }).from;
  if (typeof candidate !== 'string') {
    return HOME;
  }
  if (
    candidate.length === 0 ||
    containsControlCharacters(candidate) ||
    hasBackslash(candidate) ||
    hasUrlScheme(candidate) ||
    isProtocolRelativeHost(candidate)
  ) {
    return HOME;
  }
  return isExactAllowedPath(candidate) ? candidate : HOME;
}
