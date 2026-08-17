import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { OUTPUT_DIR } from './paths';

const REDACTED = '[redacted]';

/**
 * Scans the private output directory (inside the OS temp dir) and replaces any
 * occurrence of the in-memory E2E credentials (e-mail/password) inside text
 * files. Playwright writes `error-context.md` on failure with an aria snapshot
 * that can include input values; there is no documented option to disable it,
 * so this redactor removes the sensitive values wherever they appear. Runs in
 * the worker fixture teardown, where the credentials still exist in memory.
 */
export function redactOutputDir(credentials: { email: string; password: string }): void {
  if (!existsSync(OUTPUT_DIR)) {
    return;
  }
  for (const file of walk(OUTPUT_DIR)) {
    let text: string;
    try {
      text = readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    if (!text.includes(credentials.email) && !text.includes(credentials.password)) {
      continue;
    }
    const redacted = text
      .split(credentials.password)
      .join(REDACTED)
      .split(credentials.email)
      .join(REDACTED);
    try {
      writeFileSync(file, redacted, 'utf8');
    } catch {
      // Best-effort: a permission/timing race must never mask a test failure.
    }
  }
}

function walk(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue;
    }
    if (stat.isDirectory()) {
      files.push(...walk(full));
    } else if (stat.isFile()) {
      files.push(full);
    }
  }
  return files;
}
