/**
 * Minimal Cookie header parser (no cookie-parser dependency). Only the
 * environment's own cookie is ever read; names from other environments are
 * ignored by the auth contract, never accepted.
 */
export function parseCookies(header: string): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const part of header.split(';')) {
    const trimmed = part.trim();
    if (trimmed.length === 0) {
      continue;
    }
    const separator = trimmed.indexOf('=');
    if (separator === -1) {
      continue;
    }
    const name = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    if (name.length === 0) {
      continue;
    }
    cookies[name] = value;
  }
  return cookies;
}
