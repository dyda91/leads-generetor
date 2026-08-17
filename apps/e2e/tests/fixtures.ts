import { test as base } from '@playwright/test';
import { randomBytes } from 'node:crypto';

import { redactOutputDir } from '../setup/redact';
import { checkTestDatabase, cleanupTestDatabase, seedTestDatabase } from '../setup/seed';
import type { AdminCredentials } from '../setup/seed';

/**
 * Worker-scoped fixture that keeps the E2E admin credentials ONLY in memory:
 * generates a strong random e-mail/password with CSPRNG, validates
 * DATABASE_URL_TEST via the existing guard, defensively cleans the isolated
 * test database before seeding (recovering interrupted runs), seeds exactly one
 * admin through the in-process helper (password passed only via the controlled
 * subprocess environment), and exposes the credentials to tests via the typed
 * fixture. On teardown it scrubs any captured credential values from the private
 * output directory (redactor, which still has the credentials in memory) and
 * cleans the test database. Nothing is written to disk.
 */
export const test = base.extend<object, { adminCredentials: AdminCredentials }>({
  adminCredentials: [
    async (
      // Playwright fixtures must declare dependencies via a destructuring
      // pattern; this fixture has none, so the empty pattern is required.
      // eslint-disable-next-line no-empty-pattern
      {},
      use,
    ) => {
      checkTestDatabase();
      cleanupTestDatabase();
      const credentials: AdminCredentials = {
        email: `e2e-${randomBytes(6).toString('hex')}@example.test`,
        password: randomBytes(24).toString('base64url'),
      };
      seedTestDatabase(credentials);
      await use(credentials);
      try {
        redactOutputDir(credentials);
      } catch {
        // Best-effort: must not mask a real test failure.
      }
      try {
        cleanupTestDatabase();
      } catch {
        // Best-effort: must not mask a real test failure.
      }
    },
    { scope: 'worker' },
  ],
});
