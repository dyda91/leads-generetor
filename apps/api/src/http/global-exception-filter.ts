import { Catch, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import type { Response } from 'express';

import { ERROR_CATALOG, writeErrorEnvelope } from './error-response';
import type { ControlledError, ErrorDetail, ErrorEnvelope } from './error-response';
import { getRequestId } from './request-id';

const CONTROLLED_CODES: ReadonlySet<string> = new Set(
  Object.values(ERROR_CATALOG).map((entry) => entry.error),
);

/**
 * Boundary: errors raised INSIDE the NestJS cycle (controllers, pipes,
 * guards, interceptors, route/404 handler). Errors that occur BEFORE the
 * NestJS router is reached are handled by the pre-NestJS error middleware
 * (`parserErrorHandler`), never forwarded to Express's default handler.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const requestId = getRequestId(response);

    if (exception instanceof HttpException) {
      writeErrorEnvelope(response, this.httpEnvelope(exception, requestId));
      return;
    }

    writeErrorEnvelope(response, {
      requestId: requestId ?? 'unknown',
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      error: ERROR_CATALOG.INTERNAL_SERVER_ERROR.error,
      message: ERROR_CATALOG.INTERNAL_SERVER_ERROR.message,
    });
    this.logger.error(
      `requestId=${requestId ?? 'unknown'} error=${ERROR_CATALOG.INTERNAL_SERVER_ERROR.error}`,
    );
  }

  private httpEnvelope(exception: HttpException, requestId: string | undefined): ErrorEnvelope {
    const statusCode = exception.getStatus();
    const controlled = this.controlledResponse(exception.getResponse());
    if (controlled !== undefined) {
      return {
        requestId: requestId ?? 'unknown',
        statusCode,
        error: controlled.error,
        message: controlled.message,
        ...(controlled.details !== undefined ? { details: controlled.details } : {}),
      };
    }
    const catalog = this.statusCatalog(statusCode);
    return {
      requestId: requestId ?? 'unknown',
      statusCode,
      error: catalog.error,
      message: catalog.message,
    };
  }

  private controlledResponse(
    body: string | object,
  ): { error: string; message: string; details?: readonly ErrorDetail[] } | undefined {
    if (body !== null && typeof body === 'object' && 'error' in body) {
      const candidate = body as { error?: unknown; message?: unknown; details?: unknown };
      if (typeof candidate.error === 'string' && CONTROLLED_CODES.has(candidate.error)) {
        const details = this.validDetails(candidate.details);
        return {
          error: candidate.error,
          message:
            typeof candidate.message === 'string'
              ? candidate.message
              : ERROR_CATALOG.BAD_REQUEST.message,
          ...(details !== undefined ? { details } : {}),
        };
      }
    }
    return undefined;
  }

  private validDetails(value: unknown): readonly ErrorDetail[] | undefined {
    if (!Array.isArray(value)) {
      return undefined;
    }
    const details = value.filter(isErrorDetail);
    return details.length > 0 ? details : undefined;
  }

  private statusCatalog(statusCode: number): ControlledError {
    switch (statusCode) {
      case 400:
        return ERROR_CATALOG.VALIDATION;
      case 404:
        return ERROR_CATALOG.NOT_FOUND;
      case 405:
        return ERROR_CATALOG.METHOD_NOT_ALLOWED;
      case 413:
        return ERROR_CATALOG.PAYLOAD_TOO_LARGE;
      case 415:
        return ERROR_CATALOG.UNSUPPORTED_MEDIA_TYPE;
      case 429:
        return ERROR_CATALOG.RATE_LIMIT_EXCEEDED;
      default:
        return ERROR_CATALOG.INTERNAL_SERVER_ERROR;
    }
  }
}

function isErrorDetail(value: unknown): value is ErrorDetail {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const candidate = value as { field?: unknown; type?: unknown };
  return typeof candidate.field === 'string' && typeof candidate.type === 'string';
}
