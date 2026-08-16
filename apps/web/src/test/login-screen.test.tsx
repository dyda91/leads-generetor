import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError, messageForStatus } from '../api/errors';
import type { ApiClient } from '../api/client';
import { AuthProvider } from '../auth/AuthProvider';
import { LoginScreen } from '../features/login/LoginScreen';

const VALID_EMAIL = 'admin@example.com';
const VALID_PASSWORD = 'fixture-password';
const CSRF = 'c'.repeat(64);

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

function renderLogin(client: FakeClient): HTMLElement {
  client.getCurrentSession.mockRejectedValue(
    ApiError.http(401, { message: messageForStatus(401) }),
  );
  const view = render(
    <AuthProvider client={client as unknown as ApiClient}>
      <LoginScreen />
    </AuthProvider>,
  );
  return view.container;
}

function fillForm(email: string, password: string): void {
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: password } });
}

function submitForm(): void {
  fireEvent.submit(screen.getByRole('form', { name: /entrar/i }));
}

describe('LoginScreen — structure and accessibility', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the title, restricted description and private notice', () => {
    const client = createFakeClient();
    renderLogin(client);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Acesse sua conta');
    expect(screen.getByText(/acesso é restrito ao administrador/i)).toBeInTheDocument();
    expect(screen.getByText('Ambiente privado.')).toBeInTheDocument();
  });

  it('associates labels with the inputs', () => {
    const client = createFakeClient();
    renderLogin(client);
    expect(screen.getByLabelText('E-mail')).toBeInTheDocument();
    expect(screen.getByLabelText('Senha')).toBeInTheDocument();
  });

  it('sets the correct autocomplete, type and input mode', () => {
    const client = createFakeClient();
    renderLogin(client);
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('type', 'email');
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('autocomplete', 'email');
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('inputmode', 'email');
    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'password');
    expect(screen.getByLabelText('Senha')).toHaveAttribute('autocomplete', 'current-password');
  });

  it('applies length limits compatible with the backend contract', () => {
    const client = createFakeClient();
    renderLogin(client);
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('maxlength', '254');
    expect(screen.getByLabelText('Senha')).toHaveAttribute('maxlength', '128');
  });

  it('offers a password visibility toggle', () => {
    const client = createFakeClient();
    renderLogin(client);
    const toggle = screen.getByRole('button', { name: 'Mostrar senha' });
    fireEvent.click(toggle);
    expect(screen.getByLabelText('Senha')).toHaveAttribute('type', 'text');
    expect(screen.getByRole('button', { name: 'Ocultar senha' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });

  it('has no signup or password recovery links', () => {
    const client = createFakeClient();
    renderLogin(client);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByText(/cadastr/i)).toBeNull();
    expect(screen.queryByText(/esqueci/i)).toBeNull();
  });
});

describe('LoginScreen — submission', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('submits via the form and calls auth.login exactly once', async () => {
    const client = createFakeClient();
    client.login.mockResolvedValue({
      user: { id: 'u1', email: VALID_EMAIL, role: 'ADMIN', status: 'ACTIVE' },
      csrfToken: CSRF,
    });
    const container = renderLogin(client);

    fillForm(VALID_EMAIL, VALID_PASSWORD);
    submitForm();
    await waitFor(() => expect(client.login).toHaveBeenCalledTimes(1));
    expect(client.login).toHaveBeenCalledWith({ email: VALID_EMAIL, password: VALID_PASSWORD });
    expect(container.querySelector('form')).not.toBeNull();
  });

  it('trims the email but never trims or normalizes the password', async () => {
    const client = createFakeClient();
    client.login.mockResolvedValue({
      user: { id: 'u1', email: VALID_EMAIL, role: 'ADMIN', status: 'ACTIVE' },
      csrfToken: CSRF,
    });
    renderLogin(client);

    fillForm(`  ${VALID_EMAIL}  `, `  ${VALID_PASSWORD}  `);
    submitForm();
    await waitFor(() => expect(client.login).toHaveBeenCalledTimes(1));
    expect(client.login).toHaveBeenCalledWith({
      email: VALID_EMAIL,
      password: `  ${VALID_PASSWORD}  `,
    });
  });

  it('clears the password after a successful login', async () => {
    const client = createFakeClient();
    client.login.mockResolvedValue({
      user: { id: 'u1', email: VALID_EMAIL, role: 'ADMIN', status: 'ACTIVE' },
      csrfToken: CSRF,
    });
    renderLogin(client);

    fillForm(VALID_EMAIL, VALID_PASSWORD);
    submitForm();
    await waitFor(() => expect(client.login).toHaveBeenCalledTimes(1));
    expect(screen.getByLabelText('Senha')).toHaveValue('');
  });

  it('blocks duplicate submissions while one is in flight', async () => {
    const client = createFakeClient();
    let resolveLogin!: (v: unknown) => void;
    client.login.mockReturnValue(new Promise((resolve) => (resolveLogin = resolve)));
    const container = renderLogin(client);

    fillForm(VALID_EMAIL, VALID_PASSWORD);
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    fireEvent.submit(form as HTMLFormElement);
    fireEvent.submit(form as HTMLFormElement);
    expect(client.login).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveLogin({
        user: { id: 'u1', email: VALID_EMAIL, role: 'ADMIN', status: 'ACTIVE' },
        csrfToken: CSRF,
      });
    });
  });

  it('requires both fields and never calls login when empty', () => {
    const client = createFakeClient();
    renderLogin(client);
    submitForm();
    expect(client.login).not.toHaveBeenCalled();
    expect(screen.getByText('Informe o e-mail.')).toBeInTheDocument();
    expect(screen.getByText('Informe a senha.')).toBeInTheDocument();
  });

  it('rejects an invalid e-mail without calling login', () => {
    const client = createFakeClient();
    renderLogin(client);
    fillForm('not-an-email', VALID_PASSWORD);
    submitForm();
    expect(client.login).not.toHaveBeenCalled();
    expect(screen.getByText('Informe um e-mail válido.')).toBeInTheDocument();
  });

  it('marks fields invalid only when there is a matching error', () => {
    const client = createFakeClient();
    renderLogin(client);
    submitForm();
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Senha')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('E-mail')).toHaveAttribute('aria-describedby', 'email-error');
    expect(screen.getByLabelText('Senha')).toHaveAttribute('aria-describedby', 'password-error');
  });
});

describe('LoginScreen — controlled error handling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function submitAndReadError(client: FakeClient, error: unknown): Promise<string> {
    client.login.mockRejectedValue(error);
    renderLogin(client);
    fillForm(VALID_EMAIL, VALID_PASSWORD);
    submitForm();
    const alert = await screen.findByRole('alert');
    return alert.textContent ?? '';
  }

  it('uses a uniform message for a 401 without revealing e-mail existence', async () => {
    const message = await submitAndReadError(
      createFakeClient(),
      ApiError.http(401, { message: messageForStatus(401) }),
    );
    expect(message).toBe('E-mail ou senha inválidos.');
    expect(message).not.toContain('admin@example.com');
  });

  it('maps a 400 to a controlled message', async () => {
    const message = await submitAndReadError(
      createFakeClient(),
      ApiError.http(400, { message: messageForStatus(400) }),
    );
    expect(message).toBe('Verifique os dados informados.');
  });

  it('maps a 403 to a controlled message', async () => {
    const message = await submitAndReadError(
      createFakeClient(),
      ApiError.http(403, { message: messageForStatus(403) }),
    );
    expect(message).toContain('Acesso não autorizado');
  });

  it('maps a 429 to a controlled message', async () => {
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

  it('never exposes stack, requestId, raw status or the backend body', async () => {
    const message = await submitAndReadError(
      createFakeClient(),
      ApiError.http(500, { message: messageForStatus(500), requestId: 'req-secret-id' }),
    );
    expect(message).not.toContain('req-secret-id');
    expect(message).not.toContain('500');
    expect(message).not.toContain('stack');
    expect(message).not.toMatch(/at .*\(/);
    expect(message).not.toContain('requestId');
  });
});

describe('LoginScreen — security hygiene', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never calls fetch directly or touches storage', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const client = createFakeClient();
    client.login.mockResolvedValue({
      user: { id: 'u1', email: VALID_EMAIL, role: 'ADMIN', status: 'ACTIVE' },
      csrfToken: CSRF,
    });
    renderLogin(client);
    fillForm(VALID_EMAIL, VALID_PASSWORD);
    submitForm();
    await waitFor(() => expect(client.login).toHaveBeenCalledTimes(1));
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(getItem).not.toHaveBeenCalled();
  });

  it('never logs the password or CSRF', async () => {
    const logSpy = vi.spyOn(console, 'log');
    const client = createFakeClient();
    client.login.mockRejectedValue(ApiError.http(401, { message: messageForStatus(401) }));
    renderLogin(client);
    fillForm(VALID_EMAIL, VALID_PASSWORD);
    submitForm();
    await screen.findByRole('alert');
    expect(logSpy).not.toHaveBeenCalled();
    expect(screen.queryByText(CSRF)).toBeNull();
    expect(screen.queryByText(VALID_PASSWORD)).toBeNull();
  });
});
