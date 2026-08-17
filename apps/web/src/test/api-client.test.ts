import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiClient } from '../api/client';
import { ApiError } from '../api/errors';

const BASE_URL = 'http://127.0.0.1:3000';
const CSRF = 'c'.repeat(64);

const VALID_USER = {
  id: 'u1',
  email: 'admin@example.com',
  role: 'ADMIN' as const,
  status: 'ACTIVE' as const,
};
const VALID_LOGIN = { user: VALID_USER, csrfToken: CSRF };

function jsonResponse(body: unknown, status = 200, contentType = 'application/json'): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': contentType },
  });
}

function errorResponse(status: number, code: string): Response {
  return jsonResponse(
    { requestId: 'req-123', statusCode: status, error: code, message: 'raw backend message' },
    status,
  );
}

function makeClient(fetchImpl: unknown, timeoutMs = 5000): ApiClient {
  return new ApiClient({
    baseUrl: BASE_URL,
    timeoutMs,
    fetchImpl: fetchImpl as typeof fetch,
  });
}

function lastCall(fetchImpl: ReturnType<typeof vi.fn>): { url: string; init: RequestInit } {
  const call = fetchImpl.mock.calls.at(-1);
  if (call === undefined) {
    throw new Error('Expected a fetch call.');
  }
  return { url: call[0] as string, init: call[1] as RequestInit };
}

describe('ApiClient — transport', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('sends credentials include on every call', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => jsonResponse(VALID_LOGIN));
    const client = makeClient(fetchImpl);

    await client.login({ email: 'a@b.com', password: 'secret' });
    await client.getCurrentSession();
    fetchImpl.mockImplementation(() => new Response(null, { status: 204 }));
    await client.logout(CSRF);
    fetchImpl.mockImplementation(() => jsonResponse(VALID_LOGIN));
    await client.changePassword({ currentPassword: 'old', newPassword: 'new-pass-123456' }, CSRF);

    expect(fetchImpl).toHaveBeenCalledTimes(4);
    for (const call of fetchImpl.mock.calls) {
      expect((call[1] as RequestInit).credentials).toBe('include');
    }
  });

  it('uses the exact endpoints and HTTP methods', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => jsonResponse(VALID_LOGIN));
    const client = makeClient(fetchImpl);

    await client.login({ email: 'a@b.com', password: 'secret' });
    expect(lastCall(fetchImpl)).toMatchObject({
      url: `${BASE_URL}/auth/login`,
      init: { method: 'POST' },
    });

    await client.getCurrentSession();
    expect(lastCall(fetchImpl)).toMatchObject({
      url: `${BASE_URL}/auth/me`,
      init: { method: 'GET' },
    });

    fetchImpl.mockImplementation(() => new Response(null, { status: 204 }));
    await client.logout(CSRF);
    expect(lastCall(fetchImpl)).toMatchObject({
      url: `${BASE_URL}/auth/logout`,
      init: { method: 'POST' },
    });

    fetchImpl.mockImplementation(() => jsonResponse(VALID_LOGIN));
    await client.changePassword({ currentPassword: 'old', newPassword: 'new-pass-123456' }, CSRF);
    expect(lastCall(fetchImpl)).toMatchObject({
      url: `${BASE_URL}/auth/change-password`,
      init: { method: 'POST' },
    });
  });

  it('never puts a token or CSRF value in the URL', async () => {
    const fetchImpl = vi
      .fn()
      .mockImplementationOnce(() => jsonResponse(VALID_LOGIN))
      .mockImplementationOnce(() => new Response(null, { status: 204 }));
    const client = makeClient(fetchImpl);
    await client.login({ email: 'a@b.com', password: 'secret' });
    await client.logout(CSRF);
    for (const call of fetchImpl.mock.calls) {
      expect(String(call[0])).not.toMatch(/csrf|token/i);
    }
  });

  it('sends X-CSRF-Token only on logout and change-password', async () => {
    const fetchImpl = vi.fn().mockImplementation(() => jsonResponse(VALID_LOGIN));
    const client = makeClient(fetchImpl);

    await client.login({ email: 'a@b.com', password: 'secret' });
    const loginHeaders = lastCall(fetchImpl).init.headers as Record<string, string>;
    expect(loginHeaders['X-CSRF-Token']).toBeUndefined();

    await client.getCurrentSession();
    const meHeaders = lastCall(fetchImpl).init.headers as Record<string, string>;
    expect(meHeaders['X-CSRF-Token']).toBeUndefined();

    fetchImpl.mockImplementation(() => new Response(null, { status: 204 }));
    await client.logout(CSRF);
    const logoutHeaders = lastCall(fetchImpl).init.headers as Record<string, string>;
    expect(logoutHeaders['X-CSRF-Token']).toBe(CSRF);

    fetchImpl.mockImplementation(() => jsonResponse(VALID_LOGIN));
    await client.changePassword({ currentPassword: 'old', newPassword: 'new-pass-123456' }, CSRF);
    const cpHeaders = lastCall(fetchImpl).init.headers as Record<string, string>;
    expect(cpHeaders['X-CSRF-Token']).toBe(CSRF);
  });

  it('sets Accept always and Content-Type only when a body is sent', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(VALID_LOGIN));
    const client = makeClient(fetchImpl);

    await client.login({ email: 'a@b.com', password: 'secret' });
    const loginHeaders = lastCall(fetchImpl).init.headers as Record<string, string>;
    expect(loginHeaders.Accept).toContain('application/json');
    expect(loginHeaders['Content-Type']).toBe('application/json');
    expect(JSON.parse(lastCall(fetchImpl).init.body as string)).toEqual({
      email: 'a@b.com',
      password: 'secret',
    });

    fetchImpl.mockResolvedValue(new Response(null, { status: 204 }));
    await client.logout(CSRF);
    const logoutHeaders = lastCall(fetchImpl).init.headers as Record<string, string>;
    expect(logoutHeaders.Accept).toContain('application/json');
    expect(logoutHeaders['Content-Type']).toBeUndefined();
    expect(lastCall(fetchImpl).init.body).toBeUndefined();
  });
});

describe('ApiClient — responses', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('parses a valid login response', async () => {
    const client = makeClient(vi.fn().mockResolvedValue(jsonResponse(VALID_LOGIN)));
    const result = await client.login({ email: 'a@b.com', password: 'secret' });
    expect(result).toEqual(VALID_LOGIN);
    expect(result.user.role).toBe('ADMIN');
  });

  it('parses a valid me response', async () => {
    const client = makeClient(vi.fn().mockResolvedValue(jsonResponse(VALID_LOGIN)));
    const result = await client.getCurrentSession();
    expect(result.user.email).toBe('admin@example.com');
    expect(result.csrfToken).toBe(CSRF);
  });

  it('resolves logout for a 204 response', async () => {
    const client = makeClient(vi.fn().mockResolvedValue(new Response(null, { status: 204 })));
    await expect(client.logout(CSRF)).resolves.toBeUndefined();
  });

  it.each([
    [400, 'VALIDATION_ERROR'],
    [401, 'UNAUTHORIZED'],
    [403, 'FORBIDDEN'],
    [409, 'CONFLICT'],
    [429, 'RATE_LIMIT_EXCEEDED'],
    [500, 'INTERNAL_SERVER_ERROR'],
  ] as const)('maps a %s error to a controlled ApiError', async (status, code) => {
    const client = makeClient(vi.fn().mockResolvedValue(errorResponse(status, code)));
    await expect(client.getCurrentSession()).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.kind).toBe('http');
      expect(apiError.status).toBe(status);
      expect(apiError.code).toBe(code);
      expect(apiError.requestId).toBe('req-123');
      expect(apiError.message).not.toContain('raw backend message');
      return true;
    });
  });

  it('rejects invalid JSON as an unexpected response', async () => {
    const response = new Response('{oops', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    const client = makeClient(vi.fn().mockResolvedValue(response));
    await expect(client.getCurrentSession()).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).kind).toBe('invalid-response');
      return true;
    });
  });

  it('rejects an unexpected content-type', async () => {
    const response = new Response('<html></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html' },
    });
    const client = makeClient(vi.fn().mockResolvedValue(response));
    await expect(client.getCurrentSession()).rejects.toSatisfy((error: unknown) => {
      expect((error as ApiError).kind).toBe('invalid-response');
      return true;
    });
  });

  it('rejects a response outside the contract schema', async () => {
    const client = makeClient(vi.fn().mockResolvedValue(jsonResponse({ unexpected: true })));
    await expect(client.getCurrentSession()).rejects.toSatisfy((error: unknown) => {
      expect((error as ApiError).kind).toBe('invalid-response');
      return true;
    });
  });

  it('maps a network failure to a controlled error', async () => {
    const client = makeClient(vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(client.getCurrentSession()).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.kind).toBe('network');
      expect(apiError.message).not.toContain('Failed to fetch');
      return true;
    });
  });

  it('falls back to a controlled generic error for a non-JSON error body', async () => {
    const response = new Response('Internal Server Error', {
      status: 500,
      headers: { 'Content-Type': 'text/plain' },
    });
    const client = makeClient(vi.fn().mockResolvedValue(response));
    await expect(client.getCurrentSession()).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.kind).toBe('http');
      expect(apiError.status).toBe(500);
      expect(apiError.message).not.toContain('Internal Server Error');
      expect(apiError.requestId).toBeUndefined();
      return true;
    });
  });

  it('falls back to a controlled generic error for an unparsable error body', async () => {
    const response = new Response('{broken', {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
    const client = makeClient(vi.fn().mockResolvedValue(response));
    await expect(client.getCurrentSession()).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).kind).toBe('http');
      expect((error as ApiError).message).not.toContain('{broken');
      return true;
    });
  });

  it('falls back to a controlled generic error when the envelope is malformed', async () => {
    const response = jsonResponse({ requestId: 'req-9', weird: true }, 403);
    const client = makeClient(vi.fn().mockResolvedValue(response));
    await expect(client.getCurrentSession()).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(ApiError);
      const apiError = error as ApiError;
      expect(apiError.kind).toBe('http');
      expect(apiError.status).toBe(403);
      expect(apiError.requestId).toBeUndefined();
      return true;
    });
  });

  it('rejects a logout response that is not 204 with a non-empty body', async () => {
    const response = new Response('oops', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    const client = makeClient(vi.fn().mockResolvedValue(response));
    await expect(client.logout(CSRF)).rejects.toSatisfy((error: unknown) => {
      expect(error).toBeInstanceOf(ApiError);
      expect((error as ApiError).kind).toBe('invalid-response');
      return true;
    });
  });

  it('resolves a logout response that is not 204 but carries an empty body', async () => {
    const response = new Response('', {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
    const client = makeClient(vi.fn().mockResolvedValue(response));
    await expect(client.logout(CSRF)).resolves.toBeUndefined();
  });
});

describe('ApiClient — timeout and cancellation', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function signalAwareFetch(): ReturnType<typeof vi.fn> {
    return vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          if (init.signal?.aborted === true) {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
            return;
          }
          init.signal?.addEventListener('abort', () => {
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          });
        }),
    );
  }

  it('times out with a controlled error and clears the timer', async () => {
    vi.useFakeTimers();
    const fetchImpl = signalAwareFetch();
    const client = makeClient(fetchImpl, 1000);

    const promise = client.getCurrentSession();
    const assertion = expect(promise).rejects.toSatisfy((error: unknown) => {
      expect((error as ApiError).kind).toBe('timeout');
      return true;
    });
    vi.advanceTimersByTime(1001);
    await assertion;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('distinguishes caller cancellation from a timeout', async () => {
    const fetchImpl = signalAwareFetch();
    const client = makeClient(fetchImpl, 60_000);
    const controller = new AbortController();

    const promise = client.getCurrentSession(controller.signal);
    controller.abort();
    await expect(promise).rejects.toSatisfy((error: unknown) => {
      expect((error as ApiError).kind).toBe('cancelled');
      return true;
    });
  });

  it('treats an already-aborted external signal as a cancellation', async () => {
    const fetchImpl = signalAwareFetch();
    const client = makeClient(fetchImpl, 60_000);
    const controller = new AbortController();
    controller.abort();

    await expect(client.getCurrentSession(controller.signal)).rejects.toSatisfy(
      (error: unknown) => {
        expect((error as ApiError).kind).toBe('cancelled');
        return true;
      },
    );
  });

  it('clears the timer after a successful request', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(VALID_LOGIN));
    const client = makeClient(fetchImpl, 5000);
    await client.getCurrentSession();
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('ApiClient — hygiene', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('never touches storage, cookies or console during a call', async () => {
    const getItem = vi.spyOn(Storage.prototype, 'getItem');
    const cookieSpy = vi.spyOn(document, 'cookie', 'get');
    const logSpy = vi.spyOn(console, 'log');

    const client = makeClient(vi.fn().mockResolvedValue(jsonResponse(VALID_LOGIN)));
    await client.login({ email: 'a@b.com', password: 'secret' });

    expect(getItem).not.toHaveBeenCalled();
    expect(cookieSpy).not.toHaveBeenCalled();
    expect(logSpy).not.toHaveBeenCalled();
  });
});
