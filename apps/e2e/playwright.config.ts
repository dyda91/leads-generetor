import { defineConfig, devices } from '@playwright/test';

import { API_PORT, API_URL, OUTPUT_DIR, WEB_URL, WEB_PORT } from './setup/paths';

function requireTestDatabaseUrl(): string {
  const url = process.env.DATABASE_URL_TEST;
  if (url === undefined || url.trim() === '') {
    throw new Error(
      'E2E requires DATABASE_URL_TEST pointing at the isolated test database ' +
        '(postgresql://leads_test:…@127.0.0.1:5434/leads_test).',
    );
  }
  return url;
}

const databaseUrlTest = requireTestDatabaseUrl();

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  // Single admin + single active session + strict auth rate limit (10/min for
  // login/change-password): the stateful authenticated flows live in one serial
  // journey test, and workers must not run concurrently against the same admin.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  forbidOnly: true,
  // Failure artifacts (e.g. error-context.md) are written to a private dir in
  // the OS temp dir — never the repo. The worker redactor scrubs any captured
  // credentials and the global teardown removes the directory afterwards.
  outputDir: OUTPUT_DIR,
  reporter: process.env.CI ? [['line']] : [['list']],
  use: {
    baseURL: WEB_URL,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
  },
  globalTeardown: './setup/global-teardown.ts',
  webServer: [
    {
      // The guard validates DATABASE_URL_TEST before anything touches a database;
      // then the API applies migrations (idempotent) before accepting traffic.
      // The worker-scoped fixture seeds the admin afterwards. Exclusive loopback port.
      command:
        'pnpm --filter @leads/api exec tsx test/e2e-seed.ts --check && pnpm --filter @leads/api exec prisma migrate deploy && pnpm --filter @leads/api exec tsx src/main.ts',
      url: `${API_URL}/health`,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        NODE_ENV: 'development',
        PORT: String(API_PORT),
        CORS_ORIGINS: WEB_URL,
        DATABASE_URL: databaseUrlTest,
        DATABASE_URL_TEST: databaseUrlTest,
      },
    },
    {
      // Vite dev server on an exclusive loopback port.
      command: `pnpm --filter @leads/web exec vite --port ${WEB_PORT} --strictPort`,
      url: WEB_URL,
      reuseExistingServer: false,
      timeout: 60_000,
      env: {
        VITE_API_BASE_URL: API_URL,
      },
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
