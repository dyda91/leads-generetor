import * as argon2 from 'argon2';

import type { Argon2Options } from './argon2-options';

/**
 * Argon2id password hashing. The library generates a fresh random salt per hash
 * and produces PHC-format hashes; verification and rehash detection use the
 * library's own functions (no manual comparison). The algorithm is always
 * Argon2id — never configurable to a weaker option.
 */
export class PasswordService {
  constructor(private readonly options: Argon2Options) {}

  async hash(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id, ...this.options });
  }

  async verify(password: string, hash: string): Promise<boolean> {
    return argon2.verify(hash, password);
  }

  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, {
      timeCost: this.options.timeCost,
      memoryCost: this.options.memoryCost,
      parallelism: this.options.parallelism,
    });
  }
}
