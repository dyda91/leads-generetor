import type { Environment } from '../config/environment.types';

export interface Argon2Options {
  memoryCost: number;
  timeCost: number;
  parallelism: number;
  hashLength: number;
}

/** The argon2 library always generates a fresh 16-byte salt internally. */
export const ARGON2_SALT_LENGTH = 16;

export function environmentToArgon2Options(environment: Environment): Argon2Options {
  return {
    memoryCost: environment.ARGON2_MEMORY_COST,
    timeCost: environment.ARGON2_TIME_COST,
    parallelism: environment.ARGON2_PARALLELISM,
    hashLength: environment.ARGON2_HASH_LENGTH,
  };
}
