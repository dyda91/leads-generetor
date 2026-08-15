export type NodeEnv = 'development' | 'test' | 'production';

export interface Environment {
  NODE_ENV: NodeEnv;
  PORT: number;
  CORS_ORIGINS: readonly string[];
  BODY_LIMIT_BYTES: number;
  RATE_LIMIT_TTL_MS: number;
  RATE_LIMIT_MAX: number;
}

export interface EnvironmentIssue {
  field: string;
  code: string;
  message: string;
}
