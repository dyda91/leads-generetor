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
    const sessionAbsoluteTtlMs = config.get<number>('SESSION_ABSOLUTE_TTL_MS');
    const sessionIdleTtlMs = config.get<number>('SESSION_IDLE_TTL_MS');
    const sessionTouchIntervalMs = config.get<number>('SESSION_TOUCH_INTERVAL_MS');
    const argon2MemoryCost = config.get<number>('ARGON2_MEMORY_COST');
    const argon2TimeCost = config.get<number>('ARGON2_TIME_COST');
    const argon2Parallelism = config.get<number>('ARGON2_PARALLELISM');
    const argon2HashLength = config.get<number>('ARGON2_HASH_LENGTH');
    const databaseUrl = config.get<string>('DATABASE_URL');

    if (
      nodeEnv === undefined ||
      port === undefined ||
      corsOrigins === undefined ||
      bodyLimitBytes === undefined ||
      rateLimitTtlMs === undefined ||
      rateLimitMax === undefined ||
      sessionAbsoluteTtlMs === undefined ||
      sessionIdleTtlMs === undefined ||
      sessionTouchIntervalMs === undefined ||
      argon2MemoryCost === undefined ||
      argon2TimeCost === undefined ||
      argon2Parallelism === undefined ||
      argon2HashLength === undefined ||
      databaseUrl === undefined
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
      SESSION_ABSOLUTE_TTL_MS: sessionAbsoluteTtlMs,
      SESSION_IDLE_TTL_MS: sessionIdleTtlMs,
      SESSION_TOUCH_INTERVAL_MS: sessionTouchIntervalMs,
      ARGON2_MEMORY_COST: argon2MemoryCost,
      ARGON2_TIME_COST: argon2TimeCost,
      ARGON2_PARALLELISM: argon2Parallelism,
      ARGON2_HASH_LENGTH: argon2HashLength,
      DATABASE_URL: databaseUrl,
    };
  }

  get databaseUrl(): string {
    return this.environment.DATABASE_URL;
  }

  get sessionAbsoluteTtlMs(): number {
    return this.environment.SESSION_ABSOLUTE_TTL_MS;
  }

  get sessionIdleTtlMs(): number {
    return this.environment.SESSION_IDLE_TTL_MS;
  }

  get sessionTouchIntervalMs(): number {
    return this.environment.SESSION_TOUCH_INTERVAL_MS;
  }

  get argon2MemoryCost(): number {
    return this.environment.ARGON2_MEMORY_COST;
  }

  get argon2TimeCost(): number {
    return this.environment.ARGON2_TIME_COST;
  }

  get argon2Parallelism(): number {
    return this.environment.ARGON2_PARALLELISM;
  }

  get argon2HashLength(): number {
    return this.environment.ARGON2_HASH_LENGTH;
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
