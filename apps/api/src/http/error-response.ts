import type { Response } from 'express';

export interface ErrorDetail {
  field: string;
  type: string;
}

export interface ErrorEnvelope {
  requestId: string;
  statusCode: number;
  error: string;
  message: string;
  details?: readonly ErrorDetail[];
}

export interface ControlledError {
  error: string;
  message: string;
}

export const ERROR_CATALOG = {
  VALIDATION: { error: 'VALIDATION_ERROR', message: 'Request validation failed' },
  NOT_FOUND: { error: 'NOT_FOUND', message: 'The requested resource was not found.' },
  METHOD_NOT_ALLOWED: {
    error: 'METHOD_NOT_ALLOWED',
    message: 'The HTTP method is not allowed for this resource.',
  },
  PAYLOAD_TOO_LARGE: {
    error: 'PAYLOAD_TOO_LARGE',
    message: 'The request payload is too large.',
  },
  UNSUPPORTED_MEDIA_TYPE: {
    error: 'UNSUPPORTED_MEDIA_TYPE',
    message: 'The request uses an unsupported content encoding.',
  },
  MALFORMED_JSON: {
    error: 'MALFORMED_JSON',
    message: 'The request body is not valid JSON.',
  },
  BAD_REQUEST: { error: 'BAD_REQUEST', message: 'The request is invalid.' },
  INTERNAL_SERVER_ERROR: {
    error: 'INTERNAL_SERVER_ERROR',
    message: 'An unexpected error occurred.',
  },
} as const;

export function writeErrorEnvelope(res: Response, envelope: ErrorEnvelope): void {
  if (res.headersSent) {
    res.end();
    return;
  }
  res.status(envelope.statusCode).json(envelope);
}
