import { describe, expect, it } from 'vitest';

import type { AuthUser } from '../api/schemas';
import { authReducer, initialAuthState } from '../auth/auth-state';
import type { AuthState } from '../auth/auth-state';

const USER: AuthUser = { id: 'a', email: 'a@example.com', role: 'ADMIN', status: 'ACTIVE' };
const OTHER: AuthUser = { id: 'b', email: 'b@example.com', role: 'ADMIN', status: 'ACTIVE' };

describe('authReducer (discriminated auth state)', () => {
  it('starts in the restoring state', () => {
    expect(initialAuthState.status).toBe('restoring');
  });

  it('restore success becomes authenticated with the user', () => {
    const next = authReducer({ status: 'restoring' }, { type: 'restore:success', user: USER });
    expect(next).toEqual({ status: 'authenticated', user: USER });
  });

  it('restore 401 becomes unauthenticated', () => {
    const next = authReducer({ status: 'restoring' }, { type: 'restore:unauthorized' });
    expect(next).toEqual({ status: 'unauthenticated' });
  });

  it('restore error becomes recoverable-error', () => {
    const next = authReducer({ status: 'restoring' }, { type: 'restore:error' });
    expect(next).toEqual({ status: 'recoverable-error' });
  });

  it('login success replaces the authenticated user atomically', () => {
    const before: AuthState = { status: 'authenticated', user: USER };
    const next = authReducer(before, { type: 'login:success', user: OTHER });
    expect(next).toEqual({ status: 'authenticated', user: OTHER });
  });

  it('login error never removes an existing authenticated session', () => {
    const before: AuthState = { status: 'authenticated', user: USER };
    expect(authReducer(before, { type: 'login:error' })).toBe(before);
  });

  it('login error from unauthenticated stays unauthenticated (no partial state)', () => {
    const next = authReducer({ status: 'unauthenticated' }, { type: 'login:error' });
    expect(next).toEqual({ status: 'unauthenticated' });
  });

  it('logout success and clear become unauthenticated', () => {
    const before: AuthState = { status: 'authenticated', user: USER };
    expect(authReducer(before, { type: 'logout:success' })).toEqual({ status: 'unauthenticated' });
    expect(authReducer(before, { type: 'clear' })).toEqual({ status: 'unauthenticated' });
  });

  it('changePassword success replaces the authenticated user', () => {
    const before: AuthState = { status: 'authenticated', user: USER };
    const next = authReducer(before, { type: 'changePassword:success', user: OTHER });
    expect(next).toEqual({ status: 'authenticated', user: OTHER });
  });
});
