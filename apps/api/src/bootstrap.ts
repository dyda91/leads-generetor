import express from 'express';
import helmet from 'helmet';
import type { NestExpressApplication } from '@nestjs/platform-express';

import type { Environment } from './config/environment.types';
import { GlobalExceptionFilter } from './http/global-exception-filter';
import { parserErrorHandler } from './http/parser-error-handler';
import { requestIdMiddleware } from './http/request-id';
import { createValidationPipe } from './http/validation-pipe';

export const BIND_HOST = '127.0.0.1';

const CORS_METHODS: string[] = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const URL_ENCODED_PARAMETER_LIMIT = 100;

function normalizeOrigin(origin: string): string | undefined {
  try {
    return new URL(origin).origin;
  } catch {
    return undefined;
  }
}

function helmetOptions(environment: Environment): Parameters<typeof helmet>[0] {
  return {
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        'default-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        'base-uri': ["'none'"],
      },
    },
    hsts:
      environment.NODE_ENV === 'production'
        ? { maxAge: 31536000, includeSubDomains: true, preload: false }
        : false,
  };
}

function corsOriginCallback(allowlist: ReadonlySet<string>) {
  return (
    origin: string | undefined,
    callback: (err: Error | null, allow?: string | boolean) => void,
  ) => {
    if (origin === undefined) {
      callback(null, true);
      return;
    }
    const normalized = normalizeOrigin(origin);
    if (normalized !== undefined && allowlist.has(normalized)) {
      callback(null, normalized);
      return;
    }
    callback(null, false);
  };
}

export function applyHttpSecurity(app: NestExpressApplication, environment: Environment): void {
  app.disable('x-powered-by');
  app.set('query parser', 'simple');

  app.use(requestIdMiddleware);

  app.use(helmet(helmetOptions(environment)));

  app.enableCors({
    origin: corsOriginCallback(new Set(environment.CORS_ORIGINS)),
    credentials: true,
    methods: CORS_METHODS,
    allowedHeaders: ['Content-Type', 'X-CSRF-Token'],
  });

  app.use(
    express.json({
      limit: environment.BODY_LIMIT_BYTES,
      strict: true,
      inflate: false,
    }),
  );
  app.use(
    express.urlencoded({
      limit: environment.BODY_LIMIT_BYTES,
      extended: false,
      parameterLimit: URL_ENCODED_PARAMETER_LIMIT,
      inflate: false,
    }),
  );
}

export function applyParserErrorHandler(app: NestExpressApplication): void {
  app.use(parserErrorHandler);
}

export function applySecurityMiddleware(
  app: NestExpressApplication,
  environment: Environment,
): void {
  applyHttpSecurity(app, environment);
  applyParserErrorHandler(app);
}

export function applyApplicationControls(app: NestExpressApplication): void {
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new GlobalExceptionFilter());
}
