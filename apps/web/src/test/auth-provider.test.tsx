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

async function renderAuthenticated(client: FakeClient): Promise<void> {
  client.getCurrentSession.mockResolvedValue(session(USER_A, CSRF_1));
  renderAuth(client);
  await waitFor(() => expect(screen.getByTestId('status')).toHaveTextContent('authenticated'));
}
