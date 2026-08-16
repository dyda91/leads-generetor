import { render, screen, waitFor } from '@testing-library/react';
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
): ReturnType<typeof createFakeClient> {
  const client = createFakeClient();
  client.getCurrentSession.mockImplementation(getCurrentSession ?? (async () => SESSION));
  render(
    <AuthProvider client={client as unknown as ApiClient}>
      <App />
    </AuthProvider>,
  );
  return client;
}

describe('App (integration with AuthProvider)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the accessible product title after session restore', async () => {
    renderApp();
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Leads');
    expect(screen.getByText('Aplicação em configuração')).toBeInTheDocument();
  });

  it('uses the real design-system components (disabled future CTA, no fake links)', async () => {
    renderApp();
    expect(await screen.findByRole('button', { name: 'Em breve' })).toBeDisabled();
    expect(screen.queryByRole('link')).toBeNull();
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

  it('shows the login screen when unauthenticated (no placeholder flash)', async () => {
    renderApp(() => Promise.reject(ApiError.http(401, { message: 'Autenticação necessária.' })));
    expect(await screen.findByRole('heading', { name: 'Acesse sua conta' })).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Em breve' })).toBeNull();
  });

  it('shows the placeholder, not the login form, when authenticated', async () => {
    renderApp();
    expect(
      await screen.findByRole('heading', { name: 'Leads — Prospecção Empresarial' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Acesse sua conta' })).toBeNull();
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
