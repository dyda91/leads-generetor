import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

const REPO_ROOT = resolve(__dirname, '..', '..');

export interface AdminCredentials {
  email: string;
  password: string;
}

/**
 * Runs the API's in-process E2E seed helper as a child process, passing the
 * password ONLY through the controlled environment (never argv, never a file,
 * never printed). All subprocesses inherit a minimal fixed command; the child
 * never writes the password anywhere.
 */
function runSeed(args: readonly string[], extraEnv: Record<string, string>): void {
  const databaseUrl = process.env.DATABASE_URL_TEST;
  if (databaseUrl === undefined || databaseUrl.trim() === '') {
    throw new Error(
      'E2E requires DATABASE_URL_TEST pointing at the isolated test database ' +
        '(postgresql://leads_test:…@127.0.0.1:5434/leads_test).',
    );
  }
  try {
    execFileSync('pnpm', ['--filter', '@leads/api', 'exec', 'tsx', 'test/e2e-seed.ts', ...args], {
      cwd: REPO_ROOT,
      env: { ...process.env, DATABASE_URL_TEST: databaseUrl, ...extraEnv },
      stdio: 'pipe',
    });
  } catch (error) {
    const detail =
      error instanceof Error && typeof error.message === 'string'
        ? error.message.split('\n')[0]
        : 'the E2E seed helper failed';
    throw new Error(`E2E seed step failed: ${detail}`);
  }
}

/** Validates DATABASE_URL_TEST against the existing guard (no side effects). */
export function checkTestDatabase(): void {
  runSeed(['--check'], {});
}

/** Defensive cleanup of the isolated test database (users + sessions). */
export function cleanupTestDatabase(): void {
  runSeed(['--cleanup'], {});
}

/** Seeds exactly one admin on the isolated test database with in-memory credentials. */
export function seedTestDatabase(credentials: AdminCredentials): void {
  runSeed([], {
    E2E_ADMIN_EMAIL: credentials.email,
    E2E_ADMIN_PASSWORD: credentials.password,
  });
}
