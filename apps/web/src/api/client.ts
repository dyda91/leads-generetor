import type { z } from 'zod';

import { API_ENDPOINTS } from './endpoints';
import { ApiError, messageForStatus } from './errors';
import { errorEnvelopeSchema, loginResponseSchema, meResponseSchema } from './schemas';
import type { LoginResponse, MeResponse } from './schemas';
import type { ChangePasswordInput, LoginInput } from './types';

export interface ApiClientOptions {
  baseUrl: string;
  timeoutMs?: number;
  /** Injectable fetch for deterministic tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const CSRF_HEADER = 'X-CSRF-Token';
const JSON_CONTENT_TYPE = 'application/json';

interface RequestOptions {
  method: 'GET' | 'POST';
  path: string;
  body?: unknown;
  csrfToken?: string;
  expectNoContent?: boolean;
  signal?: AbortSignal | undefined;
}

function buildApiUrl(baseUrl: string, path: string): URL {
  const url = new URL(path, baseUrl);
  const base = new URL(baseUrl);
  if (url.origin !== base.origin) {
    throw ApiError.config('Caminho de API inválido.');
  }
  return url;
}

/**
 * Centralized typed HTTP client. Native fetch with `credentials: include`;
 * endpoints are internal constants resolved only against the validated API
 * origin; the CSRF token is an explicit argument kept outside this client and
 * sent only on protected mutations; a central AbortController timeout is always
 * cleared in `finally`; external signals are distinguishable from timeouts.
 * There is no generic public method that can call an arbitrary URL, and no
 * automatic retry of login/logout/change-password.
 */
export class ApiClient {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.fetchImpl = options.fetchImpl ?? ((...args) => fetch(...args));
  }

  async login(input: LoginInput, signal?: AbortSignal): Promise<LoginResponse> {
    const json = await this.request({
      method: 'POST',
      path: API_ENDPOINTS.login,
      body: input,
      signal,
    });
    return this.parseOrThrow(json, loginResponseSchema);
  }

  async getCurrentSession(signal?: AbortSignal): Promise<MeResponse> {
    const json = await this.request({ method: 'GET', path: API_ENDPOINTS.me, signal });
    return this.parseOrThrow(json, meResponseSchema);
  }

  async logout(csrfToken: string, signal?: AbortSignal): Promise<void> {
    await this.request({
      method: 'POST',
      path: API_ENDPOINTS.logout,
      csrfToken,
      expectNoContent: true,
      signal,
    });
  }

  async changePassword(
    input: ChangePasswordInput,
    csrfToken: string,
    signal?: AbortSignal,
  ): Promise<LoginResponse> {
    const json = await this.request({
      method: 'POST',
      path: API_ENDPOINTS.changePassword,
      body: input,
      csrfToken,
      signal,
    });
    return this.parseOrThrow(json, loginResponseSchema);
  }

  private async request(options: RequestOptions): Promise<unknown> {
    const url = buildApiUrl(this.baseUrl, options.path);
    const headers: Record<string, string> = { Accept: JSON_CONTENT_TYPE };
    if (options.body !== undefined) {
      headers['Content-Type'] = JSON_CONTENT_TYPE;
    }
    if (options.csrfToken !== undefined) {
      headers[CSRF_HEADER] = options.csrfToken;
    }
    const response = await this.fetchWithTimeout(url.toString(), {
      method: options.method,
      headers,
      credentials: 'include',
      ...(options.body !== undefined ? { body: JSON.stringify(options.body) } : {}),
      signal: options.signal ?? null,
    });
    if (!response.ok) {
      throw await this.parseError(response);
    }
    if (options.expectNoContent === true) {
      await this.consumeNoContent(response);
      return undefined;
    }
    return this.parseJson(response);
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    let timedOut = false;
    const timeoutId = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, this.timeoutMs);
    const externalSignal = init.signal ?? undefined;
    const onExternalAbort = (): void => controller.abort();
    if (externalSignal !== undefined) {
      if (externalSignal.aborted) {
        controller.abort();
      } else {
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      }
    }
    try {
      return await this.fetchImpl(url, { ...init, signal: controller.signal });
    } catch {
      if (controller.signal.aborted) {
        if (timedOut) {
          throw ApiError.timeout();
        }
        if (externalSignal?.aborted) {
          throw ApiError.cancelled();
        }
        throw ApiError.timeout();
      }
      throw ApiError.network();
    } finally {
      clearTimeout(timeoutId);
      if (externalSignal !== undefined) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
  }

  private async parseJson(response: Response): Promise<unknown> {
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes(JSON_CONTENT_TYPE)) {
      throw ApiError.invalidResponse();
    }
    try {
      return await response.json();
    } catch {
      throw ApiError.invalidResponse();
    }
  }

  private async consumeNoContent(response: Response): Promise<void> {
    if (response.status === 204) {
      return;
    }
    const text = await response.text();
    if (text.length === 0) {
      return;
    }
    throw ApiError.invalidResponse();
  }

  private async parseError(response: Response): Promise<ApiError> {
    const status = response.status;
    const generic = ApiError.http(status, { message: messageForStatus(status) });
    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes(JSON_CONTENT_TYPE)) {
      return generic;
    }
    let json: unknown;
    try {
      json = await response.json();
    } catch {
      return generic;
    }
    const parsed = errorEnvelopeSchema.safeParse(json);
    if (!parsed.success) {
      return generic;
    }
    const envelope = parsed.data;
    return ApiError.http(status, {
      message: messageForStatus(status),
      code: envelope.error,
      ...(envelope.requestId !== undefined ? { requestId: envelope.requestId } : {}),
      ...(envelope.details !== undefined ? { details: envelope.details } : {}),
    });
  }

  private parseOrThrow<T>(json: unknown, schema: z.ZodType<T>): T {
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw ApiError.invalidResponse();
    }
    return parsed.data;
  }
}
