import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

/**
 * Shared E2E constants. Ports are exclusive loopback ports owned by this suite;
 * the output directory lives under the OS temp dir (never the repo) so Playwright
 * failure artifacts (e.g. error-context.md) never persist sensitive input values
 * in the working tree.
 */
export const API_PORT = 3100;
export const WEB_PORT = 5174;
export const API_URL = `http://127.0.0.1:${API_PORT}`;
export const WEB_URL = `http://127.0.0.1:${WEB_PORT}`;

/** Private per-run output directory outside the repository. */
export const OUTPUT_DIR = resolve(tmpdir(), 'leads-e2e-test-results');
