import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

import { ERROR_CATALOG, writeErrorEnvelope } from './error-response';
import { getRequestId } from './request-id';

type ParserErrorKind =
  'payload_too_large' | 'unsupported_encoding' | 'malformed_json' | 'bad_request';

const PARSER_ERROR_TYPES: Readonly<Record<string, ParserErrorKind>> = {
  'entity.too.large': 'payload_too_large',
  'parameters.too.many': 'payload_too_large',
  'encoding.unsupported': 'unsupported_encoding',
  'entity.parse.failed': 'malformed_json',
  'request.aborted': 'bad_request',
  'request.size.invalid': 'bad_request',
};

function parserErrorKind(error: unknown): ParserErrorKind | undefined {
  if (error !== null && typeof error === 'object' && 'type' in error) {
    const type = (error as { type?: unknown }).type;
    if (typeof type === 'string') {
      return PARSER_ERROR_TYPES[type];
    }
  }
  return undefined;
}

const logger = new Logger('ParserErrorHandler');

/**
 * Boundary: errors that occur BEFORE the NestJS router is reached (request ID,
 * headers/CORS, body parsers). Known body-parser errors are mapped to a
 * controlled 400/413/415 envelope. Any OTHER error is ended here with a
 * controlled 500 envelope — it must never be forwarded with `next(error)` to
 * Express's default handler, and it must not depend on the NestJS
 * `GlobalExceptionFilter` (which handles errors raised INSIDE the NestJS cycle).
 */
export function parserErrorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  const kind = parserErrorKind(error);
  if (kind === undefined) {
    writeErrorEnvelope(res, {
      requestId: getRequestId(res) ?? 'unknown',
      statusCode: 500,
      error: ERROR_CATALOG.INTERNAL_SERVER_ERROR.error,
      message: ERROR_CATALOG.INTERNAL_SERVER_ERROR.message,
    });
    logger.error(
      `requestId=${getRequestId(res) ?? 'unknown'} error=${ERROR_CATALOG.INTERNAL_SERVER_ERROR.error}`,
    );
    return;
  }

  const controlled =
    kind === 'payload_too_large'
      ? ERROR_CATALOG.PAYLOAD_TOO_LARGE
      : kind === 'unsupported_encoding'
        ? ERROR_CATALOG.UNSUPPORTED_MEDIA_TYPE
        : kind === 'malformed_json'
          ? ERROR_CATALOG.MALFORMED_JSON
          : ERROR_CATALOG.BAD_REQUEST;

  const statusCode =
    kind === 'payload_too_large' ? 413 : kind === 'unsupported_encoding' ? 415 : 400;

  writeErrorEnvelope(res, {
    requestId: getRequestId(res) ?? 'unknown',
    statusCode,
    error: controlled.error,
    message: controlled.message,
  });
}
