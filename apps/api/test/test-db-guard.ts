export interface TestDbExpectation {
  user: string;
  database: string;
  port: number;
}

export const TEST_DB_EXPECTATION: TestDbExpectation = {
  user: 'leads_test',
  database: 'leads_test',
  port: 5434,
};

const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '::1']);

const FORBIDDEN_PARAMS: ReadonlySet<string> = new Set([
  'port',
  'host',
  'user',
  'dbname',
  'options',
  'sslmode',
  'sslcert',
  'sslrootcert',
]);

/**
 * Validates DATABASE_URL_TEST by structured URL parsing before any test or
 * migration command touches the test database. Never prints the password or the
 * full URL; rejects non-loopback hosts, the development port (5433), unexpected
 * user/database, malformed URLs, and ambiguous/dangerous query parameters.
 */
export function validateTestDatabaseUrl(url: string | undefined): void {
  if (url === undefined || url.trim() === '') {
    throw new Error('DATABASE_URL_TEST is required to run database tests.');
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error('DATABASE_URL_TEST must be a valid PostgreSQL URL.');
  }

  if (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') {
    throw new Error('DATABASE_URL_TEST must use the postgresql protocol.');
  }
  if (!LOOPBACK_HOSTS.has(parsed.hostname)) {
    throw new Error('DATABASE_URL_TEST must target a loopback host.');
  }
  if (parsed.port !== String(TEST_DB_EXPECTATION.port)) {
    throw new Error(`DATABASE_URL_TEST must target the test port ${TEST_DB_EXPECTATION.port}.`);
  }
  if (parsed.username !== TEST_DB_EXPECTATION.user) {
    throw new Error('DATABASE_URL_TEST must use the expected test user.');
  }
  const database = parsed.pathname.replace(/^\//, '');
  if (database !== TEST_DB_EXPECTATION.database) {
    throw new Error('DATABASE_URL_TEST must target the expected test database.');
  }
  for (const key of parsed.searchParams.keys()) {
    if (FORBIDDEN_PARAMS.has(key)) {
      throw new Error(`DATABASE_URL_TEST contains an unsupported parameter: ${key}.`);
    }
  }
}
