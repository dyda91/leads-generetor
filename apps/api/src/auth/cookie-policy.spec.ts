import { describe, expect, it } from '@jest/globals';

import {
  DEVELOPMENT_SESSION_COOKIE_NAME,
  PRODUCTION_SESSION_COOKIE_NAME,
  acceptsSessionCookie,
  assertSafeCookieOptions,
  sessionClearCookieOptions,
  sessionCookieName,
  sessionCookieOptions,
} from './cookie-policy';

describe('cookie policy', () => {
  it('derives the cookie name from the environment', () => {
    expect(sessionCookieName('production')).toBe(PRODUCTION_SESSION_COOKIE_NAME);
    expect(sessionCookieName('development')).toBe(DEVELOPMENT_SESSION_COOKIE_NAME);
    expect(sessionCookieName('test')).toBe(DEVELOPMENT_SESSION_COOKIE_NAME);
  });

  it('uses a Secure HttpOnly SameSite=Strict cookie in production', () => {
    const options = sessionCookieOptions('production', 604_800_000);
    expect(options.secure).toBe(true);
    expect(options.httpOnly).toBe(true);
    expect(options.sameSite).toBe('strict');
    expect(options.path).toBe('/');
    expect(options.domain).toBeUndefined();
    expect(options.maxAge).toBe(604_800_000);
  });

  it('disables Secure only for development/test (local HTTP loopback)', () => {
    for (const nodeEnv of ['development', 'test'] as const) {
      const options = sessionCookieOptions(nodeEnv, 604_800_000);
      expect(options.secure).toBe(false);
      expect(options.httpOnly).toBe(true);
      expect(options.sameSite).toBe('strict');
      expect(options.path).toBe('/');
      expect(options.domain).toBeUndefined();
    }
  });

  it('builds clear options with the same relevant attributes', () => {
    const clear = sessionClearCookieOptions('production');
    expect(clear.secure).toBe(true);
    expect(clear.httpOnly).toBe(true);
    expect(clear.sameSite).toBe('strict');
    expect(clear.path).toBe('/');
    expect(clear.domain).toBeUndefined();
    expect(clear.expires?.getTime()).toBeLessThan(Date.now());
  });

  it('accepts only the cookie name of the current environment', () => {
    expect(acceptsSessionCookie('production', PRODUCTION_SESSION_COOKIE_NAME)).toBe(true);
    expect(acceptsSessionCookie('production', DEVELOPMENT_SESSION_COOKIE_NAME)).toBe(false);
    expect(acceptsSessionCookie('test', DEVELOPMENT_SESSION_COOKIE_NAME)).toBe(true);
    expect(acceptsSessionCookie('test', PRODUCTION_SESSION_COOKIE_NAME)).toBe(false);
  });

  it('rejects unsafe cookie options (defense in depth)', () => {
    expect(() =>
      assertSafeCookieOptions(
        'production',
        { httpOnly: false, sameSite: 'strict', path: '/', secure: true },
        1000,
      ),
    ).toThrow(/HttpOnly/);
    expect(() =>
      assertSafeCookieOptions(
        'production',
        { httpOnly: true, sameSite: 'none', path: '/', secure: true },
        1000,
      ),
    ).toThrow(/SameSite=None/);
    expect(() =>
      assertSafeCookieOptions(
        'production',
        { httpOnly: true, sameSite: 'strict', path: '/', secure: true, domain: 'x.com' },
        1000,
      ),
    ).toThrow(/Domain/);
    expect(() =>
      assertSafeCookieOptions(
        'production',
        { httpOnly: true, sameSite: 'strict', path: '/x', secure: true },
        1000,
      ),
    ).toThrow(/path/);
    expect(() =>
      assertSafeCookieOptions(
        'production',
        { httpOnly: true, sameSite: 'strict', path: '/', secure: false },
        1000,
      ),
    ).toThrow(/Secure/);
    expect(() =>
      assertSafeCookieOptions(
        'production',
        { httpOnly: true, sameSite: 'strict', path: '/', secure: true, maxAge: 2000 },
        1000,
      ),
    ).toThrow(/maxAge/);
  });

  it('accepts safe cookie options', () => {
    expect(() =>
      assertSafeCookieOptions(
        'production',
        { httpOnly: true, sameSite: 'strict', path: '/', secure: true, maxAge: 500 },
        1000,
      ),
    ).not.toThrow();
    expect(() =>
      assertSafeCookieOptions(
        'test',
        { httpOnly: true, sameSite: 'strict', path: '/', secure: false },
        1000,
      ),
    ).not.toThrow();
  });
});
