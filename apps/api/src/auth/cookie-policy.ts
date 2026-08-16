import type { CookieOptions } from 'express';

import type { NodeEnv } from '../config/environment.types';

export const PRODUCTION_SESSION_COOKIE_NAME = '__Host-leads_session';
export const DEVELOPMENT_SESSION_COOKIE_NAME = 'leads_session';

/**
 * Cookie policy derived from NODE_ENV — never from free-form user input.
 * Exactly one cookie name exists per environment; the other is never emitted
 * and never accepted by the authentication contract.
 */
export function sessionCookieName(nodeEnv: NodeEnv): string {
  return nodeEnv === 'production'
    ? PRODUCTION_SESSION_COOKIE_NAME
    : DEVELOPMENT_SESSION_COOKIE_NAME;
}

export function sessionCookieOptions(nodeEnv: NodeEnv, maxAgeMs: number): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    secure: nodeEnv === 'production',
    maxAge: maxAgeMs,
  };
}

export function sessionClearCookieOptions(nodeEnv: NodeEnv): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'strict',
    path: '/',
    secure: nodeEnv === 'production',
    expires: new Date(0),
  };
}

export function acceptsSessionCookie(nodeEnv: NodeEnv, cookieName: string): boolean {
  return cookieName === sessionCookieName(nodeEnv);
}

/**
 * Guards the cookie contract. The policy above already derives safe options from
 * NODE_ENV; this assertion rejects any unsafe options object (defense in depth),
 * including a non-Secure cookie in production and a maxAge above the absolute TTL.
 */
export function assertSafeCookieOptions(
  nodeEnv: NodeEnv,
  options: CookieOptions,
  maxAgeMs: number,
): void {
  if (options.httpOnly !== true) {
    throw new Error('The session cookie must be HttpOnly.');
  }
  if (options.sameSite === 'none') {
    throw new Error('The session cookie must not use SameSite=None.');
  }
  if (options.domain !== undefined) {
    throw new Error('The session cookie must not set a Domain.');
  }
  if (options.path !== '/') {
    throw new Error('The session cookie path must be "/".');
  }
  if (nodeEnv === 'production' && options.secure !== true) {
    throw new Error('The production session cookie must be Secure.');
  }
  if (options.maxAge !== undefined && options.maxAge > maxAgeMs) {
    throw new Error('The session cookie maxAge must not exceed the absolute session TTL.');
  }
}
