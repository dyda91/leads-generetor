import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
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

function renderAt(
  initialPath: string,
  session: 'authenticated' | 'unauthenticated' = 'authenticated',
) {
  const client = createFakeClient();
  client.getCurrentSession.mockImplementation(
    session === 'authenticated'
      ? async () => SESSION
      : async () => {
          throw ApiError.http(401, { message: messageForStatus(401) });
        },
  );
  render(
    <AuthProvider client={client as unknown as ApiClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
      </MemoryRouter>
    </AuthProvider>,
  );
  return client;
}

async function openDrawer(): Promise<HTMLElement> {
  fireEvent.click(screen.getByRole('button', { name: 'Abrir menu de navegação' }));
  return screen.findByRole('dialog');
}

describe('AppShell (Grupo 7 — authenticated responsive layout)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the shell on the authenticated dashboard (/)', async () => {
    renderAt('/');
    expect(await screen.findByRole('heading', { name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
    expect(screen.getByRole('complementary')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pular para o conteúdo' })).toBeInTheDocument();
  });

  it('renders the shell on /settings/security', async () => {
    renderAt('/settings/security');
    expect(
      await screen.findByRole('heading', { name: 'Configurações de segurança' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('main')).toBeInTheDocument();
    expect(screen.getByRole('complementary')).toBeInTheDocument();
  });

  it('does not render the shell on /login', async () => {
    renderAt('/login', 'unauthenticated');
    expect(await screen.findByRole('heading', { name: 'Acesse sua conta' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.queryByText('Pular para o conteúdo')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Abrir menu de navegação' })).toBeNull();
  });

  it('does not render the shell on the public 404', async () => {
    renderAt('/some/unknown');
    expect(
      await screen.findByRole('heading', { name: 'Página não encontrada' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('complementary')).toBeNull();
    expect(screen.queryByText('Pular para o conteúdo')).toBeNull();
  });

  it('marks Dashboard as the active route on /', async () => {
    renderAt('/');
    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Segurança' })).not.toHaveAttribute('aria-current');
  });

  it('marks Segurança as the active route on /settings/security', async () => {
    renderAt('/settings/security');
    await screen.findByRole('heading', { name: 'Configurações de segurança' });
    expect(screen.getByRole('link', { name: 'Segurança' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
  });

  it('renders the nav as React Router anchors and navigates on click', async () => {
    renderAt('/');
    await screen.findByRole('heading', { name: 'Dashboard' });
    const seguranca = screen.getByRole('link', { name: 'Segurança' });
    expect(seguranca.tagName).toBe('A');
    expect(seguranca).toHaveAttribute('href', '/settings/security');
    fireEvent.click(seguranca);
    expect(
      await screen.findByRole('heading', { name: 'Configurações de segurança' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Dashboard' })).toHaveAttribute('href', '/');
  });

  it('points the skip link to the single main content', async () => {
    renderAt('/');
    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(screen.getByRole('link', { name: 'Pular para o conteúdo' })).toHaveAttribute(
      'href',
      '#main-content',
    );
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  });

  it('renders exactly one main element inside the shell', async () => {
    renderAt('/');
    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(screen.getAllByRole('main')).toHaveLength(1);
  });

  it('renders the desktop sidebar as a complementary landmark with the navigation', async () => {
    renderAt('/');
    await screen.findByRole('heading', { name: 'Dashboard' });
    const aside = screen.getByRole('complementary');
    expect(within(aside).getByRole('navigation')).toBeInTheDocument();
    expect(within(aside).getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(within(aside).getByRole('link', { name: 'Segurança' })).toBeInTheDocument();
  });

  it('renders an accessible mobile menu button', async () => {
    renderAt('/');
    await screen.findByRole('heading', { name: 'Dashboard' });
    expect(screen.getByRole('button', { name: 'Abrir menu de navegação' })).toBeInTheDocument();
  });

  it('opens the mobile drawer with the menu button', async () => {
    renderAt('/');
    await screen.findByRole('heading', { name: 'Dashboard' });
    const dialog = await openDrawer();
    expect(within(dialog).getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: 'Segurança' })).toBeInTheDocument();
    expect(
      within(dialog).getByRole('button', { name: 'Fechar menu de navegação' }),
    ).toBeInTheDocument();
  });

  it('closes the drawer with Escape and returns focus to the trigger', async () => {
    renderAt('/');
    await screen.findByRole('heading', { name: 'Dashboard' });
    const trigger = screen.getByRole('button', { name: 'Abrir menu de navegação' });
    fireEvent.click(trigger);
    await screen.findByRole('dialog');
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('closes the drawer when a nav item is selected and navigates', async () => {
    renderAt('/');
    await screen.findByRole('heading', { name: 'Dashboard' });
    const dialog = await openDrawer();
    fireEvent.click(within(dialog).getByRole('link', { name: 'Segurança' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(
      await screen.findByRole('heading', { name: 'Configurações de segurança' }),
    ).toBeInTheDocument();
  });

  it('marks the active item in the drawer', async () => {
    renderAt('/settings/security');
    await screen.findByRole('heading', { name: 'Configurações de segurança' });
    const dialog = await openDrawer();
    expect(within(dialog).getByRole('link', { name: 'Segurança' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(dialog).getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('exposes no links to non-existent resources', async () => {
    renderAt('/');
    await screen.findByRole('heading', { name: 'Dashboard' });
    const names = screen.getAllByRole('link').map((link) => link.textContent ?? '');
    expect(names).toEqual(['Pular para o conteúdo', 'Dashboard', 'Segurança']);
    expect(screen.queryByText(/pesquisar/i)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Em breve' })).toBeDisabled();
  });

  it('does not fetch, touch storage or set cookies while rendering the shell', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    renderAt('/settings/security');
    await screen.findByRole('heading', { name: 'Configurações de segurança' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(document.cookie).toBe('');
  });

  it('does not expose sensitive user data in the shell', async () => {
    renderAt('/');
    await screen.findByRole('heading', { name: 'Dashboard' });
    const bodyText = document.body.textContent ?? '';
    expect(bodyText).not.toContain(USER.id);
    expect(bodyText).not.toContain(USER.email);
    expect(bodyText).not.toContain('ADMIN');
  });
});
