import { act, render, screen, waitFor } from '@testing-library/react';
import { StrictMode, useEffect } from 'react';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, messageForStatus } from '../api/errors';
import type { ApiClient } from '../api/client';
import type { AuthUser } from '../api/schemas';
import { AuthProvider, useAuth } from '../auth/AuthProvider';
import type { AuthContextValue } from '../auth/AuthProvider';

const USER_A: AuthUser = { id: 'a', email: 'a@example.com', role: 'ADMIN', status: 'ACTIVE' };
const USER_B: AuthUser = { id: 'b', email: 'b@example.com', role: 'ADMIN', status: 'ACTIVE' };
const CSRF_1 = '1'.repeat(64);
const CSRF_2 = '2'.repeat(64);

const session = (user: AuthUser, csrfToken: string): { user: AuthUser; csrfToken: string } => ({
  user,
  csrfToken,
});
const httpError = (status: number): ApiError =>
  ApiError.http(status, { message: messageForStatus(status) });

const LOGIN_INPUT = { email: 'a@example.com', password: 'fixture-password' };
const CHANGE_INPUT = { currentPassword: 'old-password', newPassword: 'new-password-123456' };

interface FakeClient {
  login: ReturnType<typeof vi.fn>;
  getCurrentSession: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
  changePassword: ReturnType<typeof vi.fn>;
}

function createFakeClient(): FakeClient {
  return {
    login: vi.fn(),
    getCurrentSession: vi.fn(),
    logout: vi.fn(),
    changePassword: vi.fn(),
  };
}

let captured: AuthContextValue | undefined;

function Harness(): ReactNode {
  const auth = useAuth();
  useEffect(() => {
    captured = auth;
  }, [auth]);
  return <p data-testid="status">{auth.state.status}</p>;
}

function renderAuth(client: FakeClient): ReturnType<typeof render> {
  captured = undefined;
  return render(
    <AuthProvider client={client as unknown as ApiClient}>
      <Harness />
    </AuthProvider>,
  );
}

function authenticatedUser(): AuthUser {
  if (captured === undefined || captured.state.status !== 'authenticated') {
    throw new Error('Expected authenticated state.');
  }
  return captured.state.user;
}

describe('AuthProvider — restoration', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts in the restoring state', async () => {
    const client = createFakeClient();
    client.getCurrentSession.mockReturnValue(new Promise(() => {}));
    renderAuth(client);
    expect(screen.getByTestId('status')).toHaveTextContent('restoring');
  });

  it('restores a valid session to authenticated with the user in memory', async () => {
    const client = createFakeClient();
    client.getCurrentSession.mockResolvedValue(session(USER_A, CSRF_1));
    renderAuth(client);
    await screen.findByTestId('status');
    await waitFor(() => expect(authenticatedUser().email).toBe('a@example.com'));
    expect(captured?.state.status).toBe('authenticated');
  });

  it('a 401 restore becomes unauthenticated without an error state', async () => {
    const client = createFakeClient();
    client.getCurrentSession.mockRejectedValue(httpError(401));
    renderAuth(client);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));
  });

  it('a 409 restore retries exactly once and uses the final response', async () => {
    const client = createFakeClient();
    client.getCurrentSession
      .mockRejectedValueOnce(httpError(409))
      .mockResolvedValueOnce(session(USER_A, CSRF_1));
    renderAuth(client);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(client.getCurrentSession).toHaveBeenCalledTimes(2);
    expect(authenticatedUser().email).toBe('a@example.com');
  });

  it('a second 409 restore becomes a recoverable error', async () => {
    const client = createFakeClient();
    client.getCurrentSession.mockRejectedValue(httpError(409));
    renderAuth(client);
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('recoverable-error'),
    );
    expect(client.getCurrentSession).toHaveBeenCalledTimes(2);
  });

  it('discards a 409 retry that resolves after a newer login', async () => {
    const client = createFakeClient();
    let resolveRetry!: (v: { user: AuthUser; csrfToken: string }) => void;
    client.getCurrentSession.mockRejectedValueOnce(httpError(409)).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRetry = resolve;
      }),
    );
    client.login.mockResolvedValue(session(USER_B, CSRF_2));
    renderAuth(client);

    // Let the 409 retry reach its pending state before any newer operation.
    await waitFor(() => expect(client.getCurrentSession).toHaveBeenCalledTimes(2));

    await act(async () => {
      await captured?.login(LOGIN_INPUT);
    });
    expect(authenticatedUser().email).toBe('b@example.com');

    await act(async () => {
      resolveRetry(session(USER_A, CSRF_1));
    });
    // The stale 409 retry must not overwrite the newer authenticated session.
    expect(authenticatedUser().email).toBe('b@example.com');
  });

  it('ignores a stale 409 retry failure that arrives after a newer login', async () => {
    const client = createFakeClient();
    let rejectRetry!: (v: unknown) => void;
    client.getCurrentSession.mockRejectedValueOnce(httpError(409)).mockReturnValueOnce(
      new Promise((_resolve, reject) => {
        rejectRetry = reject;
      }),
    );
    client.login.mockResolvedValue(session(USER_B, CSRF_2));
    renderAuth(client);

    await waitFor(() => expect(client.getCurrentSession).toHaveBeenCalledTimes(2));

    await act(async () => {
      await captured?.login(LOGIN_INPUT);
    });
    expect(authenticatedUser().email).toBe('b@example.com');

    await act(async () => {
      rejectRetry(httpError(409));
    });
    // The stale retry failure must not touch the newer authenticated session.
    expect(authenticatedUser().email).toBe('b@example.com');
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
  });

  it.each([
    ['network', () => ApiError.network()],
    ['500', () => httpError(500)],
    ['timeout', () => ApiError.timeout()],
  ] as const)(
    'a %s restore becomes a recoverable error without logging out',
    async (_label, makeError) => {
      const client = createFakeClient();
      client.getCurrentSession.mockRejectedValue(makeError());
      renderAuth(client);
      await waitFor(() =>
        expect(screen.getByTestId('status')).toHaveTextContent('recoverable-error'),
      );
    },
  );

  it('manual retry recovers the session', async () => {
    const client = createFakeClient();
    client.getCurrentSession
      .mockRejectedValueOnce(ApiError.network())
      .mockResolvedValueOnce(session(USER_A, CSRF_1));
    renderAuth(client);
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('recoverable-error'),
    );

    await act(async () => {
      captured?.retrySessionRestore();
    });
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(client.getCurrentSession).toHaveBeenCalledTimes(2);
  });

  it('multiple consumers trigger a single restore call', async () => {
    const client = createFakeClient();
    client.getCurrentSession.mockResolvedValue(session(USER_A, CSRF_1));
    function TwoConsumers(): ReactNode {
      const a = useAuth();
      const b = useAuth();
      return (
        <>
          <p data-testid="status">{a.state.status}</p>
          <p data-testid="status2">{b.state.status}</p>
        </>
      );
    }
    render(
      <AuthProvider client={client as unknown as ApiClient}>
        <TwoConsumers />
      </AuthProvider>,
    );
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(client.getCurrentSession).toHaveBeenCalledTimes(1);
  });

  it('concurrent retries share the in-flight restore promise', async () => {
    const client = createFakeClient();
    client.getCurrentSession
      .mockRejectedValueOnce(ApiError.network())
      .mockResolvedValueOnce(session(USER_A, CSRF_1));
    renderAuth(client);
    await waitFor(() =>
      expect(screen.getByTestId('status')).toHaveTextContent('recoverable-error'),
    );

    await act(async () => {
      captured?.retrySessionRestore();
      captured?.retrySessionRestore();
    });
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(client.getCurrentSession).toHaveBeenCalledTimes(2);
  });

  it('StrictMode does not trigger simultaneous restores or loops', async () => {
    const client = createFakeClient();
    client.getCurrentSession.mockResolvedValue(session(USER_A, CSRF_1));
    captured = undefined;
    render(
      <StrictMode>
        <AuthProvider client={client as unknown as ApiClient}>
          <Harness />
        </AuthProvider>
      </StrictMode>,
    );
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
    expect(client.getCurrentSession).toHaveBeenCalledTimes(1);
  });
});

describe('AuthProvider — login', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a successful login authenticates and replaces the session', async () => {
    const client = createFakeClient();
    client.getCurrentSession.mockRejectedValue(httpError(401));
    client.login.mockResolvedValue(session(USER_A, CSRF_1));
    renderAuth(client);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));

    await act(async () => {
      await captured?.login(LOGIN_INPUT);
    });
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
    expect(authenticatedUser().email).toBe('a@example.com');
    expect(client.login).toHaveBeenCalledWith(LOGIN_INPUT);
  });

  it('a failed login leaves no partial session and propagates a controlled error', async () => {
    const client = createFakeClient();
    client.getCurrentSession.mockRejectedValue(httpError(401));
    client.login.mockRejectedValue(httpError(401));
    renderAuth(client);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));

    let caught: unknown;
    await act(async () => {
      try {
        await captured?.login(LOGIN_INPUT);
      } catch (error) {
        caught = error;
      }
    });
    expect(caught).toBeInstanceOf(ApiError);
    expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');
  });

  it('a second concurrent login is blocked deterministically', async () => {
    const client = createFakeClient();
    client.getCurrentSession.mockRejectedValue(httpError(401));
    let resolveLogin!: (v: unknown) => void;
    client.login.mockReturnValue(new Promise((r) => (resolveLogin = r)));
    renderAuth(client);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));

    const first = captured?.login(LOGIN_INPUT);
    const second = captured?.login(LOGIN_INPUT);
    await act(async () => {
      resolveLogin(session(USER_A, CSRF_1));
      await Promise.allSettled([first, second]);
    });
    expect(client.login).toHaveBeenCalledTimes(1);
    await expect(second).rejects.toThrow('Um login já está em andamento.');
  });
});

describe('AuthProvider — logout', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function renderAuthenticated(client: FakeClient): Promise<void> {
    client.getCurrentSession.mockResolvedValue(session(USER_A, CSRF_1));
    renderAuth(client);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
  }

  it('sends the in-memory CSRF on logout and clears state on success', async () => {
    const client = createFakeClient();
    client.logout.mockResolvedValue(undefined);
    await renderAuthenticated(client);

    await act(async () => {
      await captured?.logout();
    });
    expect(client.logout).toHaveBeenCalledWith(CSRF_1);
    expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');
  });

  it('a 401 logout clears local state', async () => {
    const client = createFakeClient();
    client.logout.mockRejectedValue(httpError(401));
    await renderAuthenticated(client);

    await act(async () => {
      await captured?.logout().catch(() => {});
    });
    expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');
  });

  it('a 500 logout preserves the authenticated session and propagates the error', async () => {
    const client = createFakeClient();
    client.logout.mockRejectedValue(httpError(500));
    await renderAuthenticated(client);

    let caught: unknown;
    await act(async () => {
      try {
        await captured?.logout();
      } catch (error) {
        caught = error;
      }
    });
    expect(caught).toBeInstanceOf(ApiError);
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
  });

  it('logout without a CSRF clears local state without calling the API', async () => {
    const client = createFakeClient();
    client.getCurrentSession.mockRejectedValue(httpError(401));
    renderAuth(client);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));

    await act(async () => {
      await captured?.logout();
    });
    expect(client.logout).not.toHaveBeenCalled();
    expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');
  });

  it('logout does not allow a stale restore to resurrect the session', async () => {
    const client = createFakeClient();
    let resolveRestore!: (v: { user: AuthUser; csrfToken: string }) => void;
    client.getCurrentSession.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveRestore = resolve;
      }),
    );
    client.logout.mockResolvedValue(undefined);
    renderAuth(client);

    await act(async () => {
      resolveRestore(session(USER_A, CSRF_1));
    });
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));

    await act(async () => {
      await captured?.logout();
    });
    expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');
    expect(client.getCurrentSession).toHaveBeenCalledTimes(1);
  });

  it('concurrent logout calls settle safely and the latest op wins', async () => {
    const client = createFakeClient();
    let resolveLogout!: () => void;
    client.logout.mockReturnValue(new Promise<void>((resolve) => (resolveLogout = resolve)));
    await renderAuthenticated(client);

    const first = captured?.logout();
    const second = captured?.logout();
    await act(async () => {
      resolveLogout();
      await Promise.allSettled([first, second]);
    });
    expect(client.logout).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');
  });

  it('ignores a stale logout failure that arrives after a newer login', async () => {
    const client = createFakeClient();
    let rejectLogout!: (v: unknown) => void;
    client.logout.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectLogout = reject;
      }),
    );
    await renderAuthenticated(client);

    const pendingLogout = captured?.logout();
    expect(client.logout).toHaveBeenCalledTimes(1);
    // A newer login wins the operation id before the logout settles.
    await act(async () => {
      client.login.mockResolvedValue(session(USER_B, CSRF_2));
      const loginPromise = captured?.login({ email: 'b@example.com', password: 'x' });
      await loginPromise;
    });
    await act(async () => {
      rejectLogout(httpError(500));
      await pendingLogout;
    });
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
    expect(authenticatedUser().email).toBe('b@example.com');
    expect(client.logout).toHaveBeenCalledTimes(1);
  });
});

describe('AuthProvider — change password', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function renderAuthenticated(client: FakeClient): Promise<void> {
    client.getCurrentSession.mockResolvedValue(session(USER_A, CSRF_1));
    renderAuth(client);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
  }

  it('replaces the CSRF with the change-password response', async () => {
    const client = createFakeClient();
    client.changePassword.mockResolvedValue(session(USER_A, CSRF_2));
    client.logout.mockResolvedValue(undefined);
    await renderAuthenticated(client);

    await act(async () => {
      await captured?.changePassword(CHANGE_INPUT);
    });
    expect(client.changePassword).toHaveBeenCalledWith(CHANGE_INPUT, CSRF_1);
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated');

    await act(async () => {
      await captured?.logout();
    });
    expect(client.logout).toHaveBeenCalledWith(CSRF_2);
  });

  it('a failed change-password preserves the previous state and CSRF', async () => {
    const client = createFakeClient();
    client.changePassword.mockRejectedValue(httpError(500));
    client.logout.mockResolvedValue(undefined);
    await renderAuthenticated(client);

    let caught: unknown;
    await act(async () => {
      try {
        await captured?.changePassword(CHANGE_INPUT);
      } catch (error) {
        caught = error;
      }
    });
    expect(caught).toBeInstanceOf(ApiError);
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated');

    await act(async () => {
      await captured?.logout();
    });
    expect(client.logout).toHaveBeenCalledWith(CSRF_1);
  });

  it('a 401 change-password clears the local session', async () => {
    const client = createFakeClient();
    client.changePassword.mockRejectedValue(httpError(401));
    await renderAuthenticated(client);

    await act(async () => {
      await captured?.changePassword(CHANGE_INPUT).catch(() => {});
    });
    expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');
  });

  it('change-password without a CSRF clears local state and throws a 401', async () => {
    const client = createFakeClient();
    client.getCurrentSession.mockRejectedValue(httpError(401));
    renderAuth(client);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));

    let caught: unknown;
    await act(async () => {
      try {
        await captured?.changePassword(CHANGE_INPUT);
      } catch (error) {
        caught = error;
      }
    });
    expect(client.changePassword).not.toHaveBeenCalled();
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).status).toBe(401);
    expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');
  });

  it('ignores a stale change-password failure that arrives after a newer login', async () => {
    const client = createFakeClient();
    let rejectChange!: (v: unknown) => void;
    client.changePassword.mockReturnValue(
      new Promise((_resolve, reject) => {
        rejectChange = reject;
      }),
    );
    await renderAuthenticated(client);

    const pendingChange = captured?.changePassword(CHANGE_INPUT);
    expect(client.changePassword).toHaveBeenCalledTimes(1);
    // A newer login wins the operation id before the change settles.
    await act(async () => {
      client.login.mockResolvedValue(session(USER_B, CSRF_2));
      const loginPromise = captured?.login({ email: 'b@example.com', password: 'x' });
      await loginPromise;
    });
    await act(async () => {
      rejectChange(httpError(500));
      await pendingChange;
    });
    expect(screen.getByTestId('status')).toHaveTextContent('authenticated');
    expect(authenticatedUser().email).toBe('b@example.com');
  });

  it('ignores a stale change-password success that arrives after a newer logout', async () => {
    const client = createFakeClient();
    let resolveChange!: (v: { user: AuthUser; csrfToken: string }) => void;
    client.changePassword.mockReturnValue(
      new Promise((resolve) => {
        resolveChange = resolve;
      }),
    );
    await renderAuthenticated(client);

    const pendingChange = captured?.changePassword(CHANGE_INPUT);
    await act(async () => {
      await captured?.logout();
    });
    expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');

    await act(async () => {
      resolveChange(session(USER_A, CSRF_2));
      await pendingChange;
    });
    // The stale success must not resurrect the session after logout.
    expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');
  });
});

describe('AuthProvider — concurrency and lifecycle', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('a stale restore result never overrides a later login', async () => {
    const client = createFakeClient();
    let resolveRestore!: (v: { user: AuthUser; csrfToken: string }) => void;
    client.getCurrentSession.mockReturnValue(
      new Promise((resolve) => {
        resolveRestore = resolve;
      }),
    );
    client.login.mockResolvedValue(session(USER_A, CSRF_1));
    renderAuth(client);

    await act(async () => {
      await captured?.login(LOGIN_INPUT);
    });
    expect(authenticatedUser().email).toBe('a@example.com');

    await act(async () => {
      resolveRestore(session(USER_B, CSRF_2));
    });
    expect(authenticatedUser().email).toBe('a@example.com');
  });

  it('a stale restore result never resurrects the session after logout', async () => {
    const client = createFakeClient();
    let resolveRestore!: (v: { user: AuthUser; csrfToken: string }) => void;
    client.getCurrentSession.mockReturnValue(
      new Promise((resolve) => {
        resolveRestore = resolve;
      }),
    );
    client.login.mockResolvedValue(session(USER_A, CSRF_1));
    client.logout.mockResolvedValue(undefined);
    renderAuth(client);

    await act(async () => {
      await captured?.login(LOGIN_INPUT);
    });
    await act(async () => {
      await captured?.logout();
    });
    expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');

    await act(async () => {
      resolveRestore(session(USER_B, CSRF_2));
    });
    expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');
  });

  it('a stale login result never overrides a newer logout', async () => {
    const client = createFakeClient();
    client.getCurrentSession.mockRejectedValue(httpError(401));
    let resolveLogin!: (v: { user: AuthUser; csrfToken: string }) => void;
    client.login.mockReturnValue(
      new Promise((resolve) => {
        resolveLogin = resolve;
      }),
    );
    client.logout.mockResolvedValue(undefined);
    renderAuth(client);
    await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated'));

    await act(async () => {
      const pendingLogin = captured?.login(LOGIN_INPUT);
      await captured?.logout();
      resolveLogin(session(USER_A, CSRF_1));
      await pendingLogin;
    });
    // The login resolved after the logout bumped the operation id: it must not
    // resurrect the session.
    expect(screen.getByTestId('status')).toHaveTextContent('unauthenticated');
  });

  it('does not update state after unmount', async () => {
    const client = createFakeClient();
    let resolveRestore!: (v: { user: AuthUser; csrfToken: string }) => void;
    client.getCurrentSession.mockReturnValue(
      new Promise((resolve) => {
        resolveRestore = resolve;
      }),
    );
    const { unmount } = renderAuth(client);
    unmount();

    await act(async () => {
      resolveRestore(session(USER_A, CSRF_1));
    });
    expect(screen.queryByTestId('status')).toBeNull();
  });

  it('never touches storage, cookies or console', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const cookieSpy = vi.spyOn(document, 'cookie', 'get');
    const logSpy = vi.spyOn(console, 'log');
    const client = createFakeClient();
    client.getCurrentSession.mockResolvedValue(session(USER_A, CSRF_1));
    client.logout.mockResolvedValue(undefined);
    await renderAuthenticated(client);
    await act(async () => {
      await captured?.logout();
    });
    expect(getItem).not.toHaveBeenCalled();
    expect(cookieSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('never puts passwords or CSRF in error messages', async () => {
    const client = createFakeClient();
    client.getCurrentSession.mockResolvedValue(session(USER_A, CSRF_1));
    client.changePassword.mockRejectedValue(httpError(500));
    await renderAuthenticated(client);

    let caught: unknown;
    await act(async () => {
      try {
        await captured?.changePassword(CHANGE_INPUT);
      } catch (error) {
        caught = error;
      }
    });
    const message = caught instanceof Error ? caught.message : String(caught);
    expect(message).not.toContain('new-password');
    expect(message).not.toContain(CSRF_1);
    expect(message).not.toContain(CSRF_2);
  });
});

describe('useAuth', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('throws when used outside the AuthProvider', () => {
    expect(() => render(<Harness />)).toThrow('useAuth must be used within an AuthProvider.');
  });
});

async function renderAuthenticated(client: FakeClient): Promise<void> {
  client.getCurrentSession.mockResolvedValue(session(USER_A, CSRF_1));
  renderAuth(client);
  await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
}
