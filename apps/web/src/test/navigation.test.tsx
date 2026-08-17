import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App';
import type { ApiClient } from '../api/client';
import { ApiError, messageForStatus } from '../api/errors';
import { AuthProvider, useAuth } from '../auth/AuthProvider';

const USER = {
  id: 'u1',
  email: 'admin@example.com',
  role: 'ADMIN' as const,
  status: 'ACTIVE' as const,
};
const SESSION = { user: USER, csrfToken: 'c'.repeat(64) };
const LOGIN_SUCCESS = SESSION;
const VALID_EMAIL = 'admin@example.com';
const VALID_PASSWORD = 'fixture-password';

interface FakeClient {
  login: ReturnType<typeof vi.fn>;
  getCurrentSession: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
  changePassword: ReturnType<typeof vi.fn>;
}

function createFakeClient(
  overrides: {
    login?: () => Promise<unknown>;
    getCurrentSession?: () => Promise<unknown>;
    logout?: () => Promise<unknown>;
  } = {},
): FakeClient {
  return {
    login: vi.fn(overrides.login ?? (async () => LOGIN_SUCCESS)),
    getCurrentSession: vi.fn(overrides.getCurrentSession ?? (async () => SESSION)),
    logout: vi.fn(overrides.logout ?? (async () => undefined)),
    changePassword: vi.fn(async () => LOGIN_SUCCESS),
  };
}

function unauthorizedSession(): () => Promise<never> {
  return async () => {
    throw ApiError.http(401, { message: messageForStatus(401) });
  };
}

interface LocationSnapshot {
  pathname: string;
  state: unknown;
  navigationType: string;
}

function LocationProbe({
  snapshotRef,
}: {
  snapshotRef: { current: LocationSnapshot | undefined };
}) {
  const location = useLocation();
  const navigationType = useNavigationType();
  useEffect(() => {
    snapshotRef.current = { pathname: location.pathname, state: location.state, navigationType };
  }, [location, navigationType, snapshotRef]);
  return null;
}

function LogoutTrigger() {
  const { logout } = useAuth();
  return (
    <button type="button" onClick={() => void logout()}>
      Sair (teste)
    </button>
  );
}

interface RenderAppOptions {
  client?: FakeClient;
  initialEntries?: Array<string | { pathname: string; state?: unknown }>;
  children?: ReactNode;
}

function renderApp(options: RenderAppOptions = {}): FakeClient {
  const client = options.client ?? createFakeClient();
  render(
    <AuthProvider client={client as unknown as ApiClient}>
      <MemoryRouter initialEntries={options.initialEntries ?? ['/']}>
        {options.children}
        <App />
      </MemoryRouter>
    </AuthProvider>,
  );
  return client;
}

function performLogin(): void {
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: VALID_EMAIL } });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: VALID_PASSWORD } });
  fireEvent.submit(screen.getByRole('form', { name: /entrar/i }));
}

function deferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('navigation (Grupo 6 — protected routes and safe post-login destination)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders /login for an unauthenticated user', async () => {
    const client = renderApp({
      client: createFakeClient({ getCurrentSession: unauthorizedSession() }),
      initialEntries: ['/login'],
    });
    expect(await screen.findByRole('heading', { name: 'Acesse sua conta' })).toBeInTheDocument();
    expect(client.login).not.toHaveBeenCalled();
  });

  it('protects / and renders the dashboard placeholder when authenticated', async () => {
    renderApp({ initialEntries: ['/'] });
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('protects /settings/security and renders its placeholder when authenticated', async () => {
    renderApp({ initialEntries: ['/settings/security'] });
    expect(await screen.findByRole('heading', { name: 'Segurança da conta' })).toBeInTheDocument();
  });

  it('renders the accessible 404 for an unknown route', async () => {
    renderApp({ initialEntries: ['/some/unknown/path'] });
    expect(
      await screen.findByRole('heading', { name: 'Página não encontrada' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir para o início' })).toHaveAttribute('href', '/');
  });

  it('redirects an unauthenticated user to /login and never flashes protected content', async () => {
    const snapshot: { current: LocationSnapshot | undefined } = { current: undefined };
    renderApp({
      client: createFakeClient({ getCurrentSession: unauthorizedSession() }),
      initialEntries: ['/settings/security'],
      children: <LocationProbe snapshotRef={snapshot} />,
    });
    expect(await screen.findByRole('heading', { name: 'Acesse sua conta' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Segurança da conta' })).toBeNull();
    await waitFor(() => expect(snapshot.current?.pathname).toBe('/login'));
    expect(snapshot.current?.navigationType).toBe('REPLACE');
  });

  it('never flashes protected content while the session is restoring', async () => {
    const gate = deferred<typeof SESSION>();
    renderApp({
      client: createFakeClient({ getCurrentSession: () => gate.promise }),
      initialEntries: ['/'],
    });
    expect(screen.getByRole('status')).toHaveTextContent('Restaurando sessão');
    expect(screen.queryByRole('heading', { name: 'Dashboard' })).toBeNull();
    await act(async () => {
      gate.resolve(SESSION);
    });
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('does not redirect while the session is restoring', async () => {
    const gate = deferred<typeof SESSION>();
    const snapshot: { current: LocationSnapshot | undefined } = { current: undefined };
    renderApp({
      client: createFakeClient({ getCurrentSession: () => gate.promise }),
      initialEntries: ['/'],
      children: <LocationProbe snapshotRef={snapshot} />,
    });
    expect(screen.getByRole('status')).toHaveTextContent('Restaurando sessão');
    await waitFor(() => expect(snapshot.current).toBeDefined());
    expect(snapshot.current?.pathname).toBe('/');
  });

  it('keeps the recoverable error with retry instead of logging out', async () => {
    const snapshot: { current: LocationSnapshot | undefined } = { current: undefined };
    renderApp({
      client: createFakeClient({
        getCurrentSession: async () => {
          throw ApiError.network();
        },
      }),
      initialEntries: ['/settings/security'],
      children: <LocationProbe snapshotRef={snapshot} />,
    });
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível conectar');
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
    await waitFor(() => expect(snapshot.current?.pathname).toBe('/settings/security'));
    expect(screen.queryByRole('heading', { name: 'Segurança da conta' })).toBeNull();
  });

  it('retries session restore from the recoverable error', async () => {
    const client = renderApp({
      client: createFakeClient({
        getCurrentSession: vi
          .fn()
          .mockRejectedValueOnce(ApiError.network())
          .mockResolvedValueOnce(SESSION),
      }),
      initialEntries: ['/'],
    });
    expect(await screen.findByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(client.getCurrentSession).toHaveBeenCalledTimes(2);
  });

  it('redirects an authenticated user away from /login to /', async () => {
    const snapshot: { current: LocationSnapshot | undefined } = { current: undefined };
    renderApp({
      initialEntries: ['/login'],
      children: <LocationProbe snapshotRef={snapshot} />,
    });
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    await waitFor(() => expect(snapshot.current?.pathname).toBe('/'));
    expect(snapshot.current?.navigationType).toBe('REPLACE');
  });

  it('navigates to / after a successful login using replace', async () => {
    const snapshot: { current: LocationSnapshot | undefined } = { current: undefined };
    const client = renderApp({
      client: createFakeClient({ getCurrentSession: unauthorizedSession() }),
      initialEntries: ['/login'],
      children: <LocationProbe snapshotRef={snapshot} />,
    });
    expect(await screen.findByRole('heading', { name: 'Acesse sua conta' })).toBeInTheDocument();
    performLogin();
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    await waitFor(() => expect(snapshot.current?.pathname).toBe('/'));
    expect(snapshot.current?.navigationType).toBe('REPLACE');
    expect(client.login).toHaveBeenCalledTimes(1);
  });

  it('preserves the internal destination /settings/security after login', async () => {
    const snapshot: { current: LocationSnapshot | undefined } = { current: undefined };
    renderApp({
      client: createFakeClient({ getCurrentSession: unauthorizedSession() }),
      initialEntries: ['/settings/security'],
      children: <LocationProbe snapshotRef={snapshot} />,
    });
    expect(await screen.findByRole('heading', { name: 'Acesse sua conta' })).toBeInTheDocument();
    performLogin();
    expect(await screen.findByRole('heading', { name: 'Segurança da conta' })).toBeInTheDocument();
    await waitFor(() => expect(snapshot.current?.pathname).toBe('/settings/security'));
  });

  it.each([
    ['absolute URL', 'https://evil.example.com'],
    ['protocol-relative host', '//evil.example.com'],
    ['javascript scheme', 'javascript:alert(1)'],
    ['data scheme', 'data:text/html,<script>alert(1)</script>'],
    ['backslash', '\\evil.example.com'],
    ['unknown path', '/admin/delete'],
    ['tampered from value', { from: 42 }],
    ['empty from value', { from: '' }],
  ] as const)(
    'rejects a malicious post-login destination (%s) and lands on /',
    async (_label, from) => {
      const snapshot: { current: LocationSnapshot | undefined } = { current: undefined };
      renderApp({
        client: createFakeClient({ getCurrentSession: unauthorizedSession() }),
        initialEntries: [{ pathname: '/login', state: { from } }],
        children: <LocationProbe snapshotRef={snapshot} />,
      });
      expect(await screen.findByRole('heading', { name: 'Acesse sua conta' })).toBeInTheDocument();
      performLogin();
      expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
      await waitFor(() => expect(snapshot.current?.pathname).toBe('/'));
    },
  );

  it('redirects to /login when the session ends (logout) on a protected route', async () => {
    const snapshot: { current: LocationSnapshot | undefined } = { current: undefined };
    const client = renderApp({
      client: createFakeClient({ logout: async () => undefined }),
      initialEntries: ['/'],
      children: (
        <>
          <LocationProbe snapshotRef={snapshot} />
          <LogoutTrigger />
        </>
      ),
    });
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Sair (teste)' }));
    expect(await screen.findByRole('heading', { name: 'Acesse sua conta' })).toBeInTheDocument();
    await waitFor(() => expect(snapshot.current?.pathname).toBe('/login'));
    expect(client.logout).toHaveBeenCalledTimes(1);
  });

  it('uses replace on every redirect so the history does not loop', async () => {
    const snapshot: { current: LocationSnapshot | undefined } = { current: undefined };
    renderApp({
      client: createFakeClient({ getCurrentSession: unauthorizedSession() }),
      initialEntries: ['/settings/security'],
      children: <LocationProbe snapshotRef={snapshot} />,
    });
    expect(await screen.findByRole('heading', { name: 'Acesse sua conta' })).toBeInTheDocument();
    await waitFor(() => expect(snapshot.current?.navigationType).toBe('REPLACE'));
    performLogin();
    expect(await screen.findByRole('heading', { name: 'Segurança da conta' })).toBeInTheDocument();
    await waitFor(() => expect(snapshot.current?.navigationType).toBe('REPLACE'));
    await waitFor(() => expect(snapshot.current?.pathname).toBe('/settings/security'));
  });

  it('stores only the pathname in location.state, never sensitive data', async () => {
    const snapshot: { current: LocationSnapshot | undefined } = { current: undefined };
    renderApp({
      client: createFakeClient({ getCurrentSession: unauthorizedSession() }),
      initialEntries: ['/settings/security'],
      children: <LocationProbe snapshotRef={snapshot} />,
    });
    expect(await screen.findByRole('heading', { name: 'Acesse sua conta' })).toBeInTheDocument();
    await waitFor(() => expect(snapshot.current).toBeDefined());
    expect(snapshot.current?.state).toEqual({ from: '/settings/security' });
  });

  it('never touches storage, document.cookie or fetch directly during a protected flow', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const client = renderApp({
      client: createFakeClient({
        getCurrentSession: unauthorizedSession(),
        login: async () => LOGIN_SUCCESS,
      }),
      initialEntries: ['/settings/security'],
    });
    expect(await screen.findByRole('heading', { name: 'Acesse sua conta' })).toBeInTheDocument();
    performLogin();
    await screen.findByRole('heading', { name: 'Segurança da conta' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(document.cookie).toBe('');
    expect(client.login).toHaveBeenCalledTimes(1);
  });
});
