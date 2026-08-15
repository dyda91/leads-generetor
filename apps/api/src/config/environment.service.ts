import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Environment, NodeEnv } from './environment.types';

@Injectable()
export class EnvironmentService {
  private readonly environment: Environment;

  constructor(@Inject(ConfigService) config: ConfigService) {
    const nodeEnv = config.get<NodeEnv>('NODE_ENV');
    const port = config.get<number>('PORT');
    const corsOrigins = config.get<readonly string[]>('CORS_ORIGINS');
    const bodyLimitBytes = config.get<number>('BODY_LIMIT_BYTES');
    const rateLimitTtlMs = config.get<number>('RATE_LIMIT_TTL_MS');
    const rateLimitMax = config.get<number>('RATE_LIMIT_MAX');

    if (
      nodeEnv === undefined ||
      port === undefined ||
      corsOrigins === undefined ||
      bodyLimitBytes === undefined ||
      rateLimitTtlMs === undefined ||
      rateLimitMax === undefined
    ) {
      throw new Error('Validated environment is not available.');
    }

    this.environment = {
      NODE_ENV: nodeEnv,
      PORT: port,
      CORS_ORIGINS: corsOrigins,
      BODY_LIMIT_BYTES: bodyLimitBytes,
      RATE_LIMIT_TTL_MS: rateLimitTtlMs,
      RATE_LIMIT_MAX: rateLimitMax,
    };
  }

  get nodeEnv(): NodeEnv {
    return this.environment.NODE_ENV;
  }

  get port(): number {
    return this.environment.PORT;
  }

  get corsOrigins(): readonly string[] {
    return this.environment.CORS_ORIGINS;
  }

  get bodyLimitBytes(): number {
    return this.environment.BODY_LIMIT_BYTES;
  }

  get rateLimitTtlMs(): number {
    return this.environment.RATE_LIMIT_TTL_MS;
  }

  get rateLimitMax(): number {
    return this.environment.RATE_LIMIT_MAX;
  }

  get isProduction(): boolean {
    return this.environment.NODE_ENV === 'production';
  }
}
