import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import type { ReactNode } from 'react';

import { getApiClient } from '../api';
import type { ApiClient } from '../api/client';
import { ApiError, messageForStatus } from '../api/errors';
import type { AuthUser } from '../api/schemas';
import type { ChangePasswordInput, LoginInput } from '../api/types';
import { authReducer, initialAuthState } from './auth-state';
import type { AuthState } from './auth-state';

export interface AuthContextValue {
  state: AuthState;
  /** The authenticated user; undefined unless `state.status === 'authenticated'`. */
  user: AuthUser | undefined;
  login: (input: LoginInput) => Promise<void>;
  logout: () => Promise<void>;
  changePassword: (input: ChangePasswordInput) => Promise<void>;
  retrySessionRestore: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const LOGIN_IN_PROGRESS_ERROR = 'Um login já está em andamento.';

interface AuthProviderProps {
  children: ReactNode;
  /** Injectable client for tests; defaults to the application singleton. */
  client?: ApiClient;
}

/**
 * Owns the auth session in memory: user + CSRF (CSRF only in a ref, never
 * exposed), discriminated auth state, single-flight session restoration with
 * exactly one controlled retry on a concurrent 409, and typed login/logout/
 * changePassword operations. Stale async results are rejected via an operation
 * id, so a later login/logout always prevails over earlier restores. No
 * storage, no document.cookie, no persistence.
 */
export function AuthProvider({ children, client }: AuthProviderProps) {
  const apiClient = client ?? getApiClient();
  const [state, dispatch] = useReducer(authReducer, initialAuthState);

  const csrfRef = useRef<string | undefined>(undefined);
  const inFlightRestoreRef = useRef<Promise<void> | undefined>(undefined);
  const opIdRef = useRef(0);
  const loginInFlightRef = useRef(false);
  const mountedRef = useRef(false);

  const restoreSession = useCallback((): Promise<void> => {
    const existing = inFlightRestoreRef.current;
    if (existing !== undefined) {
      return existing;
    }
    const opId = opIdRef.current;
    const promise = (async () => {
      dispatch({ type: 'restore:start' });
      try {
        const response = await apiClient.getCurrentSession();
        if (!mountedRef.current || opId !== opIdRef.current) {
          return;
        }
        csrfRef.current = response.csrfToken;
        dispatch({ type: 'restore:success', user: response.user });
      } catch (error) {
        if (!mountedRef.current || opId !== opIdRef.current) {
          return;
        }
        if (isHttpError(error, 401)) {
          csrfRef.current = undefined;
          dispatch({ type: 'restore:unauthorized' });
          return;
        }
        if (isHttpError(error, 409)) {
          try {
            const retry = await apiClient.getCurrentSession();
            if (!mountedRef.current || opId !== opIdRef.current) {
              return;
            }
            csrfRef.current = retry.csrfToken;
            dispatch({ type: 'restore:success', user: retry.user });
          } catch {
            if (!mountedRef.current || opId !== opIdRef.current) {
              return;
            }
            dispatch({ type: 'restore:error' });
          }
          return;
        }
        dispatch({ type: 'restore:error' });
      } finally {
        inFlightRestoreRef.current = undefined;
      }
    })();
    inFlightRestoreRef.current = promise;
    return promise;
  }, [apiClient]);

  useEffect(() => {
    mountedRef.current = true;
    void restoreSession();
    return () => {
      mountedRef.current = false;
    };
  }, [restoreSession]);

  const login = useCallback(
    async (input: LoginInput): Promise<void> => {
      if (loginInFlightRef.current) {
        throw new Error(LOGIN_IN_PROGRESS_ERROR);
      }
      loginInFlightRef.current = true;
      const opId = ++opIdRef.current;
      try {
        const response = await apiClient.login(input);
        if (!mountedRef.current || opId !== opIdRef.current) {
          return;
        }
        csrfRef.current = response.csrfToken;
        dispatch({ type: 'login:success', user: response.user });
      } catch (error) {
        if (mountedRef.current && opId === opIdRef.current) {
          dispatch({ type: 'login:error' });
        }
        throw error;
      } finally {
        loginInFlightRef.current = false;
      }
    },
    [apiClient],
  );

  const logout = useCallback(async (): Promise<void> => {
    const opId = ++opIdRef.current;
    const csrf = csrfRef.current;
    if (csrf === undefined) {
      dispatch({ type: 'clear' });
      return;
    }
    try {
      await apiClient.logout(csrf);
      if (!mountedRef.current || opId !== opIdRef.current) {
        return;
      }
      csrfRef.current = undefined;
      dispatch({ type: 'logout:success' });
    } catch (error) {
      if (!mountedRef.current || opId !== opIdRef.current) {
        return;
      }
      if (isHttpError(error, 401)) {
        csrfRef.current = undefined;
        dispatch({ type: 'logout:success' });
        return;
      }
      // 403/409/429/500: do not assume the session ended; keep it, rethrow.
      throw error;
    }
  }, [apiClient]);

  const changePassword = useCallback(
    async (input: ChangePasswordInput): Promise<void> => {
      const opId = ++opIdRef.current;
      const csrf = csrfRef.current;
      if (csrf === undefined) {
        dispatch({ type: 'clear' });
        throw ApiError.http(401, { message: messageForStatus(401) });
      }
      try {
        const response = await apiClient.changePassword(input, csrf);
        if (!mountedRef.current || opId !== opIdRef.current) {
          return;
        }
        csrfRef.current = response.csrfToken;
        dispatch({ type: 'changePassword:success', user: response.user });
      } catch (error) {
        if (!mountedRef.current || opId !== opIdRef.current) {
          return;
        }
        if (isHttpError(error, 401)) {
          csrfRef.current = undefined;
          dispatch({ type: 'clear' });
        }
        // 400/403/409/429/500: keep previous CSRF and state, rethrow.
        throw error;
      }
    },
    [apiClient],
  );

  const retrySessionRestore = useCallback((): void => {
    void restoreSession();
  }, [restoreSession]);

  const user = state.status === 'authenticated' ? state.user : undefined;

  const value = useMemo<AuthContextValue>(
    () => ({ state, user, login, logout, changePassword, retrySessionRestore }),
    [state, user, login, logout, changePassword, retrySessionRestore],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

function isHttpError(error: unknown, status: number): boolean {
  return error instanceof ApiError && error.kind === 'http' && error.status === status;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider.');
  }
  return context;
}
