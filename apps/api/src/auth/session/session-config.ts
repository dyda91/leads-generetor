import type { Environment } from '../../config/environment.types';

export interface SessionConfig {
  absoluteTtlMs: number;
  idleTtlMs: number;
  touchIntervalMs: number;
}

export function environmentToSessionConfig(environment: Environment): SessionConfig {
  return {
    absoluteTtlMs: environment.SESSION_ABSOLUTE_TTL_MS,
    idleTtlMs: environment.SESSION_IDLE_TTL_MS,
    touchIntervalMs: environment.SESSION_TOUCH_INTERVAL_MS,
  };
}
