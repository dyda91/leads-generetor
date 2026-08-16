import { describe, expect, it } from '@jest/globals';

import type { Argon2Options } from './argon2-options';
import { PasswordService } from './password.service';

const options: Argon2Options = { memoryCost: 19_456, timeCost: 2, parallelism: 1, hashLength: 32 };

describe('PasswordService (Argon2id)', () => {
  const service = new PasswordService(options);
  const password = 'a-strong-password-123';

  it('produces a PHC Argon2id hash with the configured parameters', async () => {
    const hash = await service.hash(password);
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(hash).toContain('m=19456');
    expect(hash).toContain('p=1');
    expect(hash).toContain('t=2');
  });

  it('uses a fresh salt per hash for the same password', async () => {
    const first = await service.hash(password);
    const second = await service.hash(password);
    expect(first).not.toBe(second);
  });

  it('never uses a fixed salt', async () => {
    const hashes = await Promise.all([
      service.hash(password),
      service.hash(password),
      service.hash(password),
    ]);
    expect(new Set(hashes).size).toBe(3);
  });

  it('verifies a correct password and rejects an incorrect one', async () => {
    const hash = await service.hash(password);
    await expect(service.verify(password, hash)).resolves.toBe(true);
    await expect(service.verify('wrong-password', hash)).resolves.toBe(false);
  });

  it('fails safely for a malformed hash', async () => {
    await expect(service.verify(password, 'not-a-valid-hash')).rejects.toThrow();
  });

  it('detects when a rehash is needed', async () => {
    const hash = await service.hash(password);
    expect(service.needsRehash(hash)).toBe(false);

    const weaker = new PasswordService({
      memoryCost: 1024,
      timeCost: 1,
      parallelism: 1,
      hashLength: 32,
    });
    const weakHash = await weaker.hash(password);
    expect(service.needsRehash(weakHash)).toBe(true);
  });

  it('does not leak the password or hash in thrown errors', async () => {
    const hash = await service.hash(password);
    let message = '';
    try {
      await service.verify(password, 'malformed');
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).not.toContain(password);
    expect(message).not.toContain(hash.slice(0, 20));
  });
});
