import { rmSync } from 'node:fs';

import { OUTPUT_DIR } from './paths';

/**
 * Defensive cleanup of the private per-run output directory. Runs on success
 * and on normal failure, so no failure artifact (e.g. error-context.md) can
 * remain after the suite. The directory is outside the repository and never
 * contains credentials in memory here — the worker fixture redactor already
 * scrubs any captured values before this teardown runs.
 */
export default function globalTeardown(): void {
  rmSync(OUTPUT_DIR, { recursive: true, force: true });
}
