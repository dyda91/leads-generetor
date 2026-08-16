import type { AuthUser } from '../api/schemas';

/**
 * Discriminated public auth state — no contradictory combinations possible.
 * CSRF is intentionally NOT part of this state; it lives in a provider-held
 * memory ref and is passed internally to the API client.
 */
export type AuthState =
  | { status: 'restoring' }
  | { status: 'authenticated'; user: AuthUser }
  | { status: 'unauthenticated' }
  | { status: 'recoverable-error' };

export const initialAuthState: AuthState = { status: 'restoring' };

export type AuthAction =
  | { type: 'restore:start' }
  | { type: 'restore:success'; user: AuthUser }
  | { type: 'restore:unauthorized' }
  | { type: 'restore:error' }
  | { type: 'login:success'; user: AuthUser }
  | { type: 'login:error' }
  | { type: 'logout:success' }
  | { type: 'clear' }
  | { type: 'changePassword:success'; user: AuthUser };

export function authReducer(state: AuthState, action: AuthAction): AuthState {
  switch (action.type) {
    case 'restore:start':
      return { status: 'restoring' };
    case 'restore:success':
    case 'login:success':
    case 'changePassword:success':
      return { status: 'authenticated', user: action.user };
    case 'restore:unauthorized':
      return { status: 'unauthenticated' };
    case 'restore:error':
      return { status: 'recoverable-error' };
    case 'login:error':
      // A failed login never leaves a partial session; if somehow called while
      // authenticated, keep the authenticated session untouched.
      return state.status === 'authenticated' ? state : { status: 'unauthenticated' };
    case 'logout:success':
    case 'clear':
      return { status: 'unauthenticated' };
  }
}
