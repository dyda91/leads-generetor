import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../App';
import type { ApiClient } from '../api/client';
import { ApiError, messageForStatus } from '../api/errors';
import { AuthProvider } from '../auth/AuthProvider';
import { validateNewPassword } from '../features/security/SecurityPage';

const USER = {
  id: 'u1',
  email: 'admin@example.com',
  role: 'ADMIN' as const,
  status: 'ACTIVE' as const,
};
const SESSION = { user: USER, csrfToken: 'c'.repeat(64) };
const CURRENT_PASSWORD = 'correct-horse-battery-staple';
const NEW_PASSWORD = 'new-correct-horse-battery-staple';

interface FakeClient {
  login: ReturnType<typeof vi.fn>;
  getCurrentSession: ReturnType<typeof vi.fn>;
  logout: ReturnType<typeof vi.fn>;
  changePassword: ReturnType<typeof vi.fn>;
}

function createFakeClient(): FakeClient {
  return {
    login: vi.fn(),
    getCurrentSession: vi.fn(async () => SESSION),
    logout: vi.fn(),
    changePassword: vi.fn(async () => SESSION),
  };
}

function renderPage(client: FakeClient): HTMLElement {
  const view = render(
    <AuthProvider client={client as unknown as ApiClient}>
      <MemoryRouter initialEntries={['/settings/security']}>
        <App />
      </MemoryRouter>
    </AuthProvider>,
  );
  return view.container;
}

function fillForm(current: string, next: string, confirmation: string): void {
  fireEvent.change(screen.getByLabelText('Senha atual'), { target: { value: current } });
  fireEvent.change(screen.getByLabelText('Nova senha'), { target: { value: next } });
  fireEvent.change(screen.getByLabelText('Confirme a nova senha'), {
    target: { value: confirmation },
  });
}

function submitForm(): void {
  fireEvent.submit(screen.getByRole('form', { name: /alterar senha/i }));
}

async function fillValidAndSubmit(client: FakeClient): Promise<void> {
  renderPage(client);
  await screen.findByRole('heading', { name: 'Segurança da conta' });
  fillForm(CURRENT_PASSWORD, NEW_PASSWORD, NEW_PASSWORD);
  submitForm();
  await waitFor(() => expect(client.changePassword).toHaveBeenCalledTimes(1));
}

describe('SecurityPage — structure, accessibility and policy (Grupo 9)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the authenticated page on /settings/security inside the shell', async () => {
    renderPage(createFakeClient());
    expect(await screen.findByRole('heading', { name: 'Segurança da conta' })).toBeInTheDocument();
    expect(screen.getByRole('complementary')).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main-content');
  });

  it('renders a single page-level h1', async () => {
    renderPage(createFakeClient());
    await screen.findByRole('heading', { name: 'Segurança da conta' });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('associates labels and sets the correct password autocomplete/type', async () => {
    renderPage(createFakeClient());
    await screen.findByRole('heading', { name: 'Segurança da conta' });
    const current = screen.getByLabelText('Senha atual');
    const next = screen.getByLabelText('Nova senha');
    const confirmation = screen.getByLabelText('Confirme a nova senha');
    expect(current).toHaveAttribute('type', 'password');
    expect(current).toHaveAttribute('autocomplete', 'current-password');
    expect(next).toHaveAttribute('type', 'password');
    expect(next).toHaveAttribute('autocomplete', 'new-password');
    expect(confirmation).toHaveAttribute('type', 'password');
    expect(confirmation).toHaveAttribute('autocomplete', 'new-password');
    expect(next).toHaveAttribute('maxlength', '128');
  });

  it('offers independent visibility toggles with accessible names', async () => {
    renderPage(createFakeClient());
    await screen.findByRole('heading', { name: 'Segurança da conta' });
    for (const name of ['Mostrar senha atual', 'Mostrar nova senha', 'Mostrar confirmação']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-pressed', 'false');
    }
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar nova senha' }));
    expect(screen.getByLabelText('Nova senha')).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Ocultar nova senha' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByLabelText('Senha atual')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Confirme a nova senha')).toHaveAttribute('type', 'password');
  });

  it('shows clear password requirements and no misleading strength estimate', async () => {
    renderPage(createFakeClient());
    await screen.findByRole('heading', { name: 'Segurança da conta' });
    expect(screen.getByText(/entre 12 e 128 caracteres/i)).toBeInTheDocument();
    expect(screen.getByText(/512 bytes em UTF-8/i)).toBeInTheDocument();
    expect(screen.getByText(/apenas espaços/i)).toBeInTheDocument();
    expect(screen.queryByText(/força|forte|fraca|pontos/i)).toBeNull();
  });

  it('validates the new-password policy against the backend contract', () => {
    expect(validateNewPassword('short')).toBe('A nova senha deve ter pelo menos 12 caracteres.');
    expect(validateNewPassword('x'.repeat(129))).toBe(
      'A nova senha deve ter no máximo 128 caracteres.',
    );
    expect(validateNewPassword(' '.repeat(12))).toBe(
      'A nova senha não pode conter apenas espaços.',
    );
    expect(validateNewPassword('x'.repeat(12))).toBeNull();
    expect(validateNewPassword('')).toBe('Informe a nova senha.');
  });

  it('does not create arbitrary uppercase/number/special rules', async () => {
    renderPage(createFakeClient());
    await screen.findByRole('heading', { name: 'Segurança da conta' });
    fillForm(CURRENT_PASSWORD, 'onlylowercasepass', 'onlylowercasepass');
    submitForm();
    await waitFor(() => expect(screen.queryByText(/maiúscula|número|especial/i)).toBeNull());
    expect(createFakeClient().changePassword).not.toHaveBeenCalled();
  });
});

describe('SecurityPage — submission and success (Grupo 9)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never trims or normalizes the passwords sent to the backend', async () => {
    const client = createFakeClient();
    renderPage(client);
    await screen.findByRole('heading', { name: 'Segurança da conta' });
    const paddedCurrent = `  ${CURRENT_PASSWORD}  `;
    const paddedNew = `  ${NEW_PASSWORD}  `;
    fillForm(paddedCurrent, paddedNew, paddedNew);
    submitForm();
    await waitFor(() => expect(client.changePassword).toHaveBeenCalledTimes(1));
    expect(client.changePassword).toHaveBeenCalledWith(
      {
        currentPassword: paddedCurrent,
        newPassword: paddedNew,
      },
      expect.any(String),
    );
  });

  it('never sends the confirmation to the backend', async () => {
    const client = createFakeClient();
    await fillValidAndSubmit(client);
    const args = client.changePassword.mock.calls[0]?.[0] as { newPassword?: string };
    expect(args).toEqual({ currentPassword: CURRENT_PASSWORD, newPassword: NEW_PASSWORD });
    expect(Object.keys(args)).not.toContain('confirmation');
  });

  it('blocks submission when the confirmation diverges from the new password', async () => {
    const client = createFakeClient();
    renderPage(client);
    await screen.findByRole('heading', { name: 'Segurança da conta' });
    fillForm(CURRENT_PASSWORD, NEW_PASSWORD, 'different-password-1234');
    submitForm();
    expect(client.changePassword).not.toHaveBeenCalled();
    expect(screen.getByText('A confirmação não coincide com a nova senha.')).toBeInTheDocument();
    expect(screen.getByLabelText('Confirme a nova senha')).toHaveAttribute('aria-invalid', 'true');
  });

  it('blocks submission when the new password fails the policy', async () => {
    const client = createFakeClient();
    renderPage(client);
    await screen.findByRole('heading', { name: 'Segurança da conta' });
    fillForm(CURRENT_PASSWORD, 'short', 'short');
    submitForm();
    expect(client.changePassword).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Nova senha')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('A nova senha deve ter pelo menos 12 caracteres.')).toBeInTheDocument();
  });

  it('requires the current password', async () => {
    const client = createFakeClient();
    renderPage(client);
    await screen.findByRole('heading', { name: 'Segurança da conta' });
    fillForm('', NEW_PASSWORD, NEW_PASSWORD);
    submitForm();
    expect(client.changePassword).not.toHaveBeenCalled();
    expect(screen.getByText('Informe a senha atual.')).toBeInTheDocument();
  });

  it('submits via auth.changePassword exactly once and clears all fields on success', async () => {
    const client = createFakeClient();
    renderPage(client);
    await screen.findByRole('heading', { name: 'Segurança da conta' });
    fillForm(CURRENT_PASSWORD, NEW_PASSWORD, NEW_PASSWORD);
    submitForm();
    await waitFor(() => expect(client.changePassword).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('Senha atual')).toHaveValue('');
    expect(screen.getByLabelText('Nova senha')).toHaveValue('');
    expect(screen.getByLabelText('Confirme a nova senha')).toHaveValue('');
  });

  it('shows a controlled success message with role status and stays on the page', async () => {
    const client = createFakeClient();
    renderPage(client);
    await screen.findByRole('heading', { name: 'Segurança da conta' });
    fillForm(CURRENT_PASSWORD, NEW_PASSWORD, NEW_PASSWORD);
    submitForm();
    const successText = await screen.findByText('Senha alterada com sucesso.');
    expect(successText.closest('[role="status"]')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Segurança da conta' })).toBeInTheDocument();
    expect(screen.getByRole('complementary')).toBeInTheDocument();
  });

  it('blocks duplicate submissions while one is in flight', async () => {
    const client = createFakeClient();
    let resolveChange!: (v: unknown) => void;
    client.changePassword.mockReturnValue(new Promise((resolve) => (resolveChange = resolve)));
    renderPage(client);
    await screen.findByRole('heading', { name: 'Segurança da conta' });
    fillForm(CURRENT_PASSWORD, NEW_PASSWORD, NEW_PASSWORD);
    const form = screen.getByRole('form', { name: /alterar senha/i });
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(client.changePassword).toHaveBeenCalledTimes(1);
    await act(async () => {
      resolveChange(SESSION);
    });
  });
});

describe('SecurityPage — controlled error handling (Grupo 9)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function submitAndReadError(client: FakeClient, error: unknown): Promise<string> {
    client.changePassword.mockRejectedValue(error);
    renderPage(client);
    await screen.findByRole('heading', { name: 'Segurança da conta' });
    fillForm(CURRENT_PASSWORD, NEW_PASSWORD, NEW_PASSWORD);
    submitForm();
    const alert = await screen.findByRole('alert');
    return alert.textContent ?? '';
  }

  it('maps a 400 to a controlled message', async () => {
    const message = await submitAndReadError(
      createFakeClient(),
      ApiError.http(400, { message: messageForStatus(400) }),
    );
    expect(message).toBe('Verifique os dados informados.');
  });

  it('maps a 403 to a controlled CSRF/origin message', async () => {
    const message = await submitAndReadError(
      createFakeClient(),
      ApiError.http(403, { message: messageForStatus(403) }),
    );
    expect(message).toBe('A solicitação não pôde ser validada. Tente novamente.');
  });

  it('maps a 409 to a controlled conflict message without retry', async () => {
    const client = createFakeClient();
    const message = await submitAndReadError(
      client,
      ApiError.http(409, { message: messageForStatus(409) }),
    );
    expect(message).toBe('Houve um conflito de sessão. Recarregue a página e tente novamente.');
    await waitFor(() => expect(client.changePassword).toHaveBeenCalledTimes(1));
  });

  it('maps a 429 to a controlled rate-limit message', async () => {
    const message = await submitAndReadError(
      createFakeClient(),
      ApiError.http(429, { message: messageForStatus(429) }),
    );
    expect(message).toContain('Muitas tentativas');
  });

  it.each([
    ['500', ApiError.http(500, { message: messageForStatus(500) })],
    ['network', ApiError.network()],
    ['timeout', ApiError.timeout()],
  ] as const)('maps %s to a temporary retryable message', async (_label, error) => {
    const message = await submitAndReadError(createFakeClient(), error);
    expect(message).toContain('Tente novamente');
  });

  it('never exposes password, CSRF, stack, requestId, raw status or body', async () => {
    const message = await submitAndReadError(
      createFakeClient(),
      ApiError.http(500, {
        message: messageForStatus(500),
        requestId: 'req-secret-id',
      }),
    );
    expect(message).not.toContain(NEW_PASSWORD);
    expect(message).not.toContain(CURRENT_PASSWORD);
    expect(message).not.toContain('c'.repeat(64));
    expect(message).not.toContain('req-secret-id');
    expect(message).not.toContain('500');
    expect(message).not.toContain('stack');
    expect(message).not.toMatch(/at .*\(/);
    expect(document.body.textContent ?? '').not.toContain('c'.repeat(64));
  });

  it('keeps the session valid after a failed change-password (no partial update)', async () => {
    const client = createFakeClient();
    client.changePassword.mockRejectedValue(ApiError.http(500, { message: messageForStatus(500) }));
    renderPage(client);
    await screen.findByRole('heading', { name: 'Segurança da conta' });
    fillForm(CURRENT_PASSWORD, NEW_PASSWORD, NEW_PASSWORD);
    submitForm();
    await screen.findByRole('alert');
    expect(screen.getByRole('heading', { name: 'Segurança da conta' })).toBeInTheDocument();
    expect(screen.getByRole('complementary')).toBeInTheDocument();
    expect(client.getCurrentSession).toHaveBeenCalledTimes(1);
  });

  it('redirects to /login when a 401 clears the session', async () => {
    const client = createFakeClient();
    client.changePassword.mockRejectedValue(ApiError.http(401, { message: messageForStatus(401) }));
    renderPage(client);
    await screen.findByRole('heading', { name: 'Segurança da conta' });
    fillForm(CURRENT_PASSWORD, NEW_PASSWORD, NEW_PASSWORD);
    submitForm();
    expect(await screen.findByRole('heading', { name: 'Acesse sua conta' })).toBeInTheDocument();
    expect(screen.queryByRole('complementary')).toBeNull();
  });
});

describe('SecurityPage — security hygiene (Grupo 9)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never calls fetch directly or touches storage/document.cookie', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const client = createFakeClient();
    await fillValidAndSubmit(client);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
    expect(setItem).not.toHaveBeenCalled();
    expect(document.cookie).toBe('');
  });

  it('never logs passwords or CSRF', async () => {
    const logSpy = vi.spyOn(console, 'log');
    const client = createFakeClient();
    client.changePassword.mockRejectedValue(ApiError.http(403, { message: messageForStatus(403) }));
    renderPage(client);
    await screen.findByRole('heading', { name: 'Segurança da conta' });
    fillForm(CURRENT_PASSWORD, NEW_PASSWORD, NEW_PASSWORD);
    submitForm();
    await screen.findByRole('alert');
    expect(logSpy).not.toHaveBeenCalled();
    expect(screen.queryByText(NEW_PASSWORD)).toBeNull();
    expect(screen.queryByText(CURRENT_PASSWORD)).toBeNull();
    expect(screen.queryByText('c'.repeat(64))).toBeNull();
  });

  it('exposes no sensitive data in the DOM after a failed attempt', async () => {
    const client = createFakeClient();
    client.changePassword.mockRejectedValue(ApiError.network());
    renderPage(client);
    await screen.findByRole('heading', { name: 'Segurança da conta' });
    fillForm(CURRENT_PASSWORD, NEW_PASSWORD, NEW_PASSWORD);
    submitForm();
    await screen.findByRole('alert');
    const bodyText = document.body.textContent ?? '';
    expect(bodyText).not.toContain(NEW_PASSWORD);
    expect(bodyText).not.toContain(CURRENT_PASSWORD);
    expect(bodyText).not.toContain(USER.id);
    expect(bodyText).not.toContain(USER.email);
  });
});
