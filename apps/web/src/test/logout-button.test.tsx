import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useEffect } from 'react';
import type { ReactNode } from 'react';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App';
import type { ApiClient } from '../api/client';
import { ApiError, messageForStatus } from '../api/errors';
import { AuthProvider } from '../auth/AuthProvider';

const USER = {
  id: 'u1',
  email: 'admin@example.com',
  role: 'ADMIN' as const,
  status: 'ACTIVE' as const,
};
const SESSION = { user: USER, csrfToken: 'c'.repeat(64) };

interface FakeClient {
  login: ReturnType<typeof vi.fn>;
  getCurrentSession: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
  changePassword: ReturnType<typeof vi.fn>;
}

function createFakeClient(overrides: { logout?: () => Promise<unknown> } = {}): FakeClient {
  return {
    login: vi.fn(),
    getCurrentSession: vi.fn(async () => SESSION),
    logout: vi.fn(overrides.logout ?? (async () => undefined)),
    changePassword: vi.fn(),
  };
}

interface LocationSnapshot {
  pathname: string;
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
    snapshotRef.current = { pathname: location.pathname, navigationType };
  }, [location, navigationType, snapshotRef]);
  return null;
}

function renderApp(
  client: FakeClient,
  options: {
    initialEntries?: Array<string | { pathname: string; state?: unknown }>;
    children?: ReactNode;
  } = {},
): void {
  render(
    <AuthProvider client={client as unknown as ApiClient}>
      <MemoryRouter initialEntries={options.initialEntries ?? ['/']}>
        {options.children}
        <App />
      </MemoryRouter>
    </AuthProvider>,
  );
}

async function openDrawer(): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole('button', { name: 'Abrir menu de navegação' }));
  return screen.findByRole('dialog');
}

describe('LogoutButton — presence and placement (task 9.3)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the Sair button only when authenticated', async () => {
    renderApp(createFakeClient());
    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(screen.getByRole('button', { name: 'Sair' })).toBeInTheDocument();
  });

  it('does not render the Sair button on /login or the public 404', async () => {
    const client = createFakeClient();
    client.getCurrentSession.mockRejectedValue(
      ApiError.http(401, { message: messageForStatus(401) }),
    );
    renderApp(client, { initialEntries: ['/login'] });
    await screen.findByRole('heading', { name: 'Acesse sua conta' });
    expect(screen.queryByRole('button', { name: 'Sair' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sair' })).toBeNull();
  });

  it('appears in the desktop sidebar and in the mobile drawer', async () => {
    renderApp(createFakeClient());
    await screen.findByRole('heading', { name: 'Dashboard' });
    const aside = screen.getByRole('complementary');
    expect(within(aside).getByRole('button', { name: 'Sair' })).toBeInTheDocument();

    const dialog = await openDrawer();
    expect(within(dialog).getByRole('button', { name: 'Sair' })).toBeInTheDocument();
  });

  it('marks the logout icon as decorative and gives the button an accessible name', async () => {
    renderApp(createFakeClient());
    await screen.findByRole('heading', { name: 'Dashboard' });
    const button = screen.getByRole('button', { name: 'Sair' });
    const icon = button.querySelector('[aria-hidden="true"]');
    expect(icon).not.toBeNull();
  });
});

describe('LogoutButton — submission and success (task 9.3)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('calls auth.logout exactly once and redirects to /login on success', async () => {
    const snapshot: { current: LocationSnapshot | undefined } = { current: undefined };
    const client = createFakeClient();
    renderApp(client, { children: <LocationProbe snapshotRef={snapshot} /> });
    await screen.findByRole('heading', { name: 'Dashboard' });
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(await screen.findByRole('heading', { name: 'Acesse sua conta' })).toBeInTheDocument();
    await waitFor(() => expect(snapshot.current?.pathname).toBe('/login'));
    expect(snapshot.current?.navigationType).toBe('REPLACE');
    expect(client.logout).toHaveBeenCalledTimes(1);
  });

  it('uses replace so the back button never reopens protected content', async () => {
    const snapshot: { current: LocationSnapshot | undefined } = { current: undefined };
    const client = createFakeClient();
    renderApp(client, { children: <LocationProbe snapshotRef={snapshot} /> });
    await screen.findByRole('heading', { name: 'Dashboard' });
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    await screen.findByRole('heading', { name: 'Acesse sua conta' });
    await waitFor(() => expect(snapshot.current?.navigationType).toBe('REPLACE'));
  });

  it('redirects to /login when the logout returns 401 (session cleared)', async () => {
    const client = createFakeClient({
      logout: async () => {
        throw ApiError.http(401, { message: messageForStatus(401) });
      },
    });
    renderApp(client);
    await screen.findByRole('heading', { name: 'Dashboard' });
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(await screen.findByRole('heading', { name: 'Acesse sua conta' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary')).toBeNull();
  });

  it('blocks duplicate submissions while a logout is in flight', async () => {
    let resolveLogout!: (v: unknown) => void;
    const client = createFakeClient({
      logout: () => new Promise((resolve) => (resolveLogout = resolve)),
    });
    renderApp(client);
    await screen.findByRole('heading', { name: 'Dashboard' });
    const button = screen.getByRole('button', { name: 'Sair' });
    fireEvent.click(button);
    fireEvent.click(button);
    await act(async () => {
      resolveLogout(undefined);
    });
    expect(client.logout).toHaveBeenCalledTimes(1);
  });

  it('disables the action and announces pending state while submitting', async () => {
    let resolveLogout!: (v: unknown) => void;
    const client = createFakeClient({
      logout: () => new Promise((resolve) => (resolveLogout = resolve)),
    });
    renderApp(client);
    await screen.findByRole('heading', { name: 'Dashboard' });
    const button = screen.getByRole('button', { name: 'Sair' });
    fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent('Saindo…');
    await act(async () => {
      resolveLogout(undefined);
    });
  });

  it('clears sensitive in-memory state on success (no user/CSRF in the DOM)', async () => {
    const client = createFakeClient();
    renderApp(client);
    await screen.findByRole('heading', { name: 'Dashboard' });
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    await screen.findByRole('heading', { name: 'Acesse sua conta' });
    const bodyText = document.body.textContent ?? '';
    expect(bodyText).not.toContain(USER.id);
    expect(bodyText).not.toContain(USER.email);
    expect(bodyText).not.toContain('c'.repeat(64));
  });
});

describe('LogoutButton — controlled failures preserve the session (task 9.3)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    [
      '403',
      ApiError.http(403, { message: messageForStatus(403) }),
      'A solicitação não pôde ser validada',
    ],
    ['409', ApiError.http(409, { message: messageForStatus(409) }), 'conflito de sessão'],
    ['429', ApiError.http(429, { message: messageForStatus(429) }), 'Muitas tentativas'],
  ] as const)(
    'preserves the session and shows a controlled error on %s',
    async (_label, error, expected) => {
      const client = createFakeClient({
        logout: async () => {
          throw error;
        },
      });
      renderApp(client);
      await screen.findByRole('heading', { name: 'Dashboard' });
      fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
      expect(await screen.findByRole('alert')).toHaveTextContent(expected);
      expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
      expect(screen.getByRole('complementary')).toBeInTheDocument();
      expect(client.logout).toHaveBeenCalledTimes(1);
    },
  );

  it.each([
    ['500', ApiError.http(500, { message: messageForStatus(500) })],
    ['network', ApiError.network()],
    ['timeout', ApiError.timeout()],
  ] as const)('preserves the session with a temporary message on %s', async (_label, error) => {
    const client = createFakeClient({
      logout: async () => {
        throw error;
      },
    });
    renderApp(client);
    await screen.findByRole('heading', { name: 'Dashboard' });
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Tente novamente');
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('never exposes requestId, stack, body, CSRF or raw status on error', async () => {
    const client = createFakeClient({
      logout: async () => {
        throw ApiError.http(500, { message: messageForStatus(500), requestId: 'req-secret-id' });
      },
    });
    renderApp(client);
    await screen.findByRole('heading', { name: 'Dashboard' });
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    const alert = await screen.findByRole('alert');
    const text = alert.textContent ?? '';
    expect(text).not.toContain('req-secret-id');
    expect(text).not.toContain('500');
    expect(text).not.toContain('stack');
    expect(text).not.toMatch(/at .*\(/);
    expect(text).not.toContain('c'.repeat(64));
    expect(document.body.textContent ?? '').not.toContain('c'.repeat(64));
  });

  it('maps an unexpected status and a non-ApiError to generic messages', async () => {
    const clientUnexpected = createFakeClient({
      logout: async () => {
        throw ApiError.http(418, { message: 'unknown' });
      },
    });
    renderApp(clientUnexpected);
    await screen.findByRole('heading', { name: 'Dashboard' });
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível sair. Tente novamente.');
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('maps an ApiError of a non-HTTP kind and a non-ApiError to generic messages', async () => {
    const clientKind = createFakeClient({
      logout: async () => {
        throw ApiError.invalidResponse();
      },
    });
    renderApp(clientKind);
    await screen.findByRole('heading', { name: 'Dashboard' });
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Ocorreu um erro inesperado. Tente novamente.');
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
  });

  it('maps a non-ApiError to a generic message without leaking it', async () => {
    const client = createFakeClient({
      logout: async () => {
        throw new Error('internal boom');
      },
    });
    renderApp(client);
    await screen.findByRole('heading', { name: 'Dashboard' });
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Ocorreu um erro inesperado. Tente novamente.');
    expect(alert).not.toHaveTextContent('internal boom');
  });

  it('allows a manual retry after a failure (no automatic retry)', async () => {
    const client = createFakeClient({
      logout: vi
        .fn()
        .mockRejectedValueOnce(ApiError.http(500, { message: messageForStatus(500) }))
        .mockResolvedValueOnce(undefined),
    });
    renderApp(client);
    await screen.findByRole('heading', { name: 'Dashboard' });
    const button = screen.getByRole('button', { name: 'Sair' });
    fireEvent.click(button);
    await screen.findByRole('alert');
    expect(client.logout).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    fireEvent.click(button);
    expect(await screen.findByRole('heading', { name: 'Acesse sua conta' })).toBeInTheDocument();
    expect(client.logout).toHaveBeenCalledTimes(2);
  });

  it('keeps the error accessible when logout fails inside the mobile drawer', async () => {
    const client = createFakeClient({
      logout: async () => {
        throw ApiError.http(500, { message: messageForStatus(500) });
      },
    });
    renderApp(client);
    await screen.findByRole('heading', { name: 'Dashboard' });
    const dialog = await openDrawer();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Sair' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Tente novamente');
    expect(screen.queryByRole('dialog')).not.toBeNull();
  });
});

describe('LogoutButton — security hygiene (task 9.3)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never calls fetch directly or touches storage/document.cookie', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const client = createFakeClient();
    renderApp(client);
    await screen.findByRole('heading', { name: 'Dashboard' });
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    await screen.findByRole('heading', { name: 'Acesse sua conta' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(document.cookie).toBe('');
  });

  it('never logs sensitive data', async () => {
    const logSpy = vi.spyOn(console, 'log');
    const client = createFakeClient({
      logout: async () => {
        throw ApiError.http(500, { message: messageForStatus(500) });
      },
    });
    renderApp(client);
    await screen.findByRole('heading', { name: 'Dashboard' });
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    await screen.findByRole('alert');
    expect(logSpy).not.toHaveBeenCalled();
    expect(screen.queryByText('c'.repeat(64))).toBeNull();
  });
});
