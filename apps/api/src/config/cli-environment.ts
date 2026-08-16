import { z } from 'zod';

import type { Argon2Options } from '../auth/argon2-options';
import {
  argon2HashLengthSchema,
  argon2MemoryCostSchema,
  argon2ParallelismSchema,
  argon2TimeCostSchema,
  databaseUrlSchema,
} from './environment.schema';

export interface CliEnvironment {
  databaseUrl: string;
  argon2Options: Argon2Options;
}

export class CliEnvironmentValidationError extends Error {
  constructor() {
    super('Invalid CLI environment configuration.');
    this.name = 'CliEnvironmentValidationError';
  }
}

/**
 * Minimal environment schema for non-HTTP command-line tools (e.g.
 * bootstrap-admin). Requires only the database URL and optional Argon2id
 * parameters; the HTTP surface (PORT, CORS_ORIGINS, session TTLs, body limits,
 * rate limits) is deliberately NOT required here. Values are never printed.
 */
const cliEnvironmentSchema = z.object({
  DATABASE_URL: databaseUrlSchema,
  ARGON2_MEMORY_COST: argon2MemoryCostSchema,
  ARGON2_TIME_COST: argon2TimeCostSchema,
  ARGON2_PARALLELISM: argon2ParallelismSchema,
  ARGON2_HASH_LENGTH: argon2HashLengthSchema,
});

export function parseCliEnvironment(source: Record<string, string | undefined>): CliEnvironment {
  const result = cliEnvironmentSchema.safeParse(source);
  if (!result.success) {
    throw new CliEnvironmentValidationError();
  }
  return {
    databaseUrl: result.data.DATABASE_URL,
    argon2Options: {
      memoryCost: result.data.ARGON2_MEMORY_COST,
      timeCost: result.data.ARGON2_TIME_COST,
      parallelism: result.data.ARGON2_PARALLELISM,
      hashLength: result.data.ARGON2_HASH_LENGTH,
    },
  };
}
