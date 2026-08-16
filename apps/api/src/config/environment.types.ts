export type NodeEnv = 'development' | 'test' | 'production';

export interface Environment {
  NODE_ENV: NodeEnv;
  PORT: number;
  CORS_ORIGINS: readonly string[];
  BODY_LIMIT_BYTES: number;
  RATE_LIMIT_TTL_MS: number;
  RATE_LIMIT_MAX: number;
  SESSION_ABSOLUTE_TTL_MS: number;
  SESSION_IDLE_TTL_MS: number;
  SESSION_TOUCH_INTERVAL_MS: number;
  ARGON2_MEMORY_COST: number;
  ARGON2_TIME_COST: number;
  ARGON2_PARALLELISM: number;
  ARGON2_HASH_LENGTH: number;
  DATABASE_URL: string;
}

export interface EnvironmentIssue {
  field: string;
  code: string;
  message: string;
}
