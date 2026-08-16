import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider } from '../auth/AuthProvider';
import type { ApiClient } from '../api/client';
import { ApiError } from '../api/errors';
import { App } from '../App';

const USER = {
  id: 'u1',
  email: 'admin@example.com',
  role: 'ADMIN' as const,
  status: 'ACTIVE' as const,
};
const SESSION = { user: USER, csrfToken: 'c'.repeat(64) };

function createFakeClient(): {
  login: ReturnType<typeof vi.fn>;
  getCurrentSession: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
  changePassword: ReturnType<typeof vi.fn>;
} {
  return {
    login: vi.fn(),
    getCurrentSession: vi.fn(),
    logout: vi.fn(),
    changePassword: vi.fn(),
  };
}

function renderApp(
  getCurrentSession?: () => Promise<unknown>,
  initialEntries: string[] = ['/'],
): ReturnType<typeof createFakeClient> {
  const client = createFakeClient();
  client.getCurrentSession.mockImplementation(getCurrentSession ?? (async () => SESSION));
  render(
    <AuthProvider client={client as unknown as ApiClient}>
      <MemoryRouter initialEntries={initialEntries}>
        <App />
      </MemoryRouter>
    </AuthProvider>,
  );
  return client;
}

describe('App (routing + AuthProvider integration)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the authenticated shell and dashboard heading after session restore at /', async () => {
    renderApp();
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Dashboard');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getAllByText('Leads').length).toBeGreaterThan(0);
  });

  it('uses the real design-system components and exposes no fake links', async () => {
    renderApp();
    expect(await screen.findByRole('button', { name: 'Pesquisar empresas' })).toBeDisabled();
    const links = screen.getAllByRole('link').map((link) => link.textContent ?? '');
    expect(links).toEqual(
      expect.arrayContaining(['Dashboard', 'Segurança', 'Pular para o conteúdo']),
    );
    expect(links).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/pesquis|lead|lista|exporta/i)]),
    );
  });

  it('shows a stable restoring state before the session resolves', async () => {
    renderApp(() => new Promise(() => {}));
    expect(screen.getByRole('status')).toHaveTextContent('Restaurando sessão');
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull();
  });

  it('shows a recoverable error with retry when the restore fails', async () => {
    renderApp(() => Promise.reject(ApiError.network()));
    expect(await screen.findByRole('alert')).toHaveTextContent('Não foi possível conectar');
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('heading', { level: 1 })).toBeNull());
  });

  it('shows the login screen when unauthenticated at /login', async () => {
    renderApp(
      () => Promise.reject(ApiError.http(401, { message: 'Autenticação necessária.' })),
      ['/login'],
    );
    expect(await screen.findByRole('heading', { name: 'Acesse sua conta' })).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pesquisar empresas' })).toBeNull();
  });

  it('redirects an unauthenticated user from a protected route to /login', async () => {
    renderApp(() => Promise.reject(ApiError.http(401, { message: 'Autenticação necessária.' })));
    expect(await screen.findByRole('heading', { name: 'Acesse sua conta' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pesquisar empresas' })).toBeNull();
  });

  it('shows the placeholder, not the login form, when authenticated at /', async () => {
    renderApp();
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Acesse sua conta' })).toBeNull();
  });

  it('renders the accessible 404 for an unknown route', async () => {
    renderApp(undefined, ['/unknown-path']);
    expect(
      await screen.findByRole('heading', { name: 'Página não encontrada' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ir para o início' })).toHaveAttribute('href', '/');
  });

  it('does not call fetch while rendering', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderApp();
    await screen.findByRole('heading', { level: 1 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('does not touch localStorage or sessionStorage while rendering', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    renderApp();
    await screen.findByRole('heading', { level: 1 });
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
  });
});
