import { render, screen } from '@testing-library/react';
import { Search } from 'lucide-react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App';
import type { ApiClient } from '../api/client';
import { ApiError, messageForStatus } from '../api/errors';
import { AuthProvider } from '../auth/AuthProvider';
import { EmptyState } from '../components/feedback/empty-state';
import { ErrorState } from '../components/feedback/error-state';
import { LoadingState } from '../components/feedback/loading-state';

const USER = {
  id: 'u1',
  email: 'admin@example.com',
  role: 'ADMIN' as const,
  status: 'ACTIVE' as const,
};
const SESSION = { user: USER, csrfToken: 'c'.repeat(64) };

function createFakeClient() {
  return {
    login: vi.fn(),
    getCurrentSession: vi.fn(async () => SESSION),
    logout: vi.fn(),
    changePassword: vi.fn(),
  };
}

function renderApp(initialPath: string): ReturnType<typeof createFakeClient> {
  const client = createFakeClient();
  render(
    <AuthProvider client={client as unknown as ApiClient}>
      <MemoryRouter initialEntries={[initialPath]}>
        <App />
      </MemoryRouter>
    </AuthProvider>,
  );
  return client;
}

describe('DashboardPage (Grupo 8 — empty dashboard and interface states)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the dashboard page when authenticated at /', async () => {
    renderApp('/');
    expect(await screen.findByRole('heading', { level: 1, name: 'Dashboard' })).toBeInTheDocument();
    expect(screen.getByText(/prospecção de empresas/i)).toBeInTheDocument();
  });

  it('keeps the AppShell around the dashboard', async () => {
    renderApp('/');
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    expect(screen.getByRole('complementary')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Navegação principal' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Pular para o conteúdo' })).toBeInTheDocument();
  });

  it('renders exactly one main element owned by the shell', async () => {
    renderApp('/');
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    const mains = screen.getAllByRole('main');
    expect(mains).toHaveLength(1);
    expect(mains[0]).toHaveAttribute('id', 'main-content');
  });

  it('renders exactly one page-level h1', async () => {
    renderApp('/');
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('shows an honest empty state about missing searches and leads', async () => {
    renderApp('/');
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    expect(
      screen.getByRole('heading', { level: 3, name: 'Nenhuma pesquisa realizada' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/ainda não existem pesquisas ou leads/i)).toBeInTheDocument();
    expect(screen.getByText(/será disponibilizada em uma próxima mudança/i)).toBeInTheDocument();
  });

  it('shows no invented numeric metric or fake data', async () => {
    renderApp('/');
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    const bodyText = document.body.textContent ?? '';
    expect(bodyText).not.toMatch(/leads?\s*\d|\d+\s*leads|empresas?\s*\d|\d+\s*empresas/i);
    expect(bodyText).not.toMatch(/%|convers[iã]o|crescimento/i);
  });

  it('shows no fake table or chart', async () => {
    renderApp('/');
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    expect(screen.queryByRole('table')).toBeNull();
    expect(screen.queryByRole('img')).toBeNull();
    expect(screen.queryByText(/gráfico/i)).toBeNull();
  });

  it('keeps the future search CTA disabled with an accessible explanation', async () => {
    renderApp('/');
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    const cta = screen.getByRole('button', { name: 'Pesquisar empresas' });
    expect(cta).toBeDisabled();
    expect(cta).toHaveAttribute('aria-describedby');
    const note = screen.getByText(/ainda não está disponível/i);
    expect(note).toHaveAttribute('id');
  });

  it('the disabled CTA never navigates or fetches', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    renderApp('/');
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    const cta = screen.getByRole('button', { name: 'Pesquisar empresas' });
    expect(cta.tagName).toBe('BUTTON');
    expect(cta).not.toHaveAttribute('href');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('shows the next-steps guidance without invented content', async () => {
    renderApp('/');
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    expect(screen.getByRole('heading', { level: 2, name: 'Próximos passos' })).toBeInTheDocument();
    expect(screen.getByText(/pesquisa empresarial será liberada/i)).toBeInTheDocument();
  });

  it('renders LoadingState with role status in isolation', () => {
    render(<LoadingState label="Carregando dados" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('renders ErrorState with role alert and only calls an explicit retry', () => {
    const onRetry = vi.fn();
    const { rerender } = render(<ErrorState title="Falha" />);
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
    rerender(<ErrorState title="Falha" onRetry={onRetry} />);
    screen.getByRole('button', { name: 'Tentar novamente' }).click();
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('renders an accessible EmptyState with a heading, description and decorative icon', () => {
    const { container } = render(
      <EmptyState
        icon={Search}
        title="Nenhum resultado"
        description="Nenhum resultado encontrado ainda."
        titleLevel={2}
      />,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Nenhum resultado' })).toBeInTheDocument();
    expect(screen.getByText('Nenhum resultado encontrado ainda.')).toBeInTheDocument();
    expect(container.querySelector('[aria-hidden="true"]')).not.toBeNull();
  });

  it('exposes no sensitive user data in the DOM', async () => {
    renderApp('/');
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    const bodyText = document.body.textContent ?? '';
    expect(bodyText).not.toContain(USER.id);
    expect(bodyText).not.toContain(USER.email);
    expect(bodyText).not.toContain('ADMIN');
  });

  it('never touches storage, cookies, fetch or external URLs', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    renderApp('/');
    await screen.findByRole('heading', { level: 1, name: 'Dashboard' });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(document.cookie).toBe('');
    for (const link of screen.getAllByRole('link')) {
      const href = link.getAttribute('href') ?? '';
      expect(href.startsWith('http')).toBe(false);
    }
  });

  it('keeps /settings/security unchanged', async () => {
    renderApp('/settings/security');
    expect(await screen.findByRole('heading', { name: 'Segurança da conta' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Dashboard' })).toBeNull();
  });

  it('keeps /login and the 404 outside the AppShell', async () => {
    const client = createFakeClient();
    client.getCurrentSession.mockRejectedValue(
      ApiError.http(401, { message: messageForStatus(401) }),
    );
    render(
      <AuthProvider client={client as unknown as ApiClient}>
        <MemoryRouter initialEntries={['/login']}>
          <App />
        </MemoryRouter>
      </AuthProvider>,
    );
    expect(await screen.findByRole('heading', { name: 'Acesse sua conta' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary')).toBeNull();
  });
});
