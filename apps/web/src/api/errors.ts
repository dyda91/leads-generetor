import type { ErrorDetail } from './schemas';

export type ApiErrorKind =
  'config' | 'network' | 'timeout' | 'cancelled' | 'http' | 'invalid-response';

export interface ApiErrorFields {
  message: string;
  status?: number;
  code?: string;
  requestId?: string;
  details?: readonly ErrorDetail[];
}

const GENERIC_MESSAGES: Record<number, string> = {
  400: 'A requisição é inválida.',
  401: 'Autenticação necessária.',
  403: 'Ação não permitida.',
  404: 'Recurso não encontrado.',
  409: 'Conflito com o estado atual.',
  429: 'Muitas tentativas. Aguarde um instante.',
  500: 'Erro interno do servidor.',
};

/** Frontend-owned, controlled message — never a raw backend body or stack. */
export function messageForStatus(status: number): string {
  return GENERIC_MESSAGES[status] ?? 'A requisição falhou.';
}

/**
 * Controlled, typed API error. Exposes only safe metadata: status, stable code,
 * a controlled message, optional requestId and sanitized details. Never the raw
 * response, headers, sent payload, unexpected exception message, stack, cookie,
 * CSRF, HTML or an unrecognized body.
 */
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | undefined;
  readonly code: string | undefined;
  readonly requestId: string | undefined;
  readonly details: readonly ErrorDetail[] | undefined;

  private constructor(kind: ApiErrorKind, fields: ApiErrorFields) {
    super(fields.message);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = fields.status;
    this.code = fields.code;
    this.requestId = fields.requestId;
    this.details = fields.details;
  }

  static http(status: number, fields: Omit<ApiErrorFields, 'status'>): ApiError {
    return new ApiError('http', { ...fields, status });
  }

  static network(): ApiError {
    return new ApiError('network', { message: 'Falha de rede. Verifique sua conexão.' });
  }

  static timeout(): ApiError {
    return new ApiError('timeout', { message: 'A requisição demorou demais.' });
  }

  static cancelled(): ApiError {
    return new ApiError('cancelled', { message: 'A requisição foi cancelada.' });
  }

  static invalidResponse(): ApiError {
    return new ApiError('invalid-response', { message: 'Resposta inesperada do servidor.' });
  }

  static config(message: string): ApiError {
    return new ApiError('config', { message });
  }
}
