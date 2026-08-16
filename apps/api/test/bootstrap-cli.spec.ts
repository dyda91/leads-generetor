import 'reflect-metadata';

import { describe, expect, it } from '@jest/globals';
import { spawnSync } from 'node:child_process';

import { buildFixturePostgresUrl } from './helpers';

const CLI = 'src/auth/bootstrap/admin-bootstrap.ts';
const VALID_DATABASE_URL =
  process.env.DATABASE_URL_TEST ??
  buildFixturePostgresUrl({
    username: 'leads',
    password: 'secret',
    port: '5432',
    database: 'leads',
  });

interface CliResult {
  status: number;
  stdout: string;
  stderr: string;
}

function runCli(environment: Record<string, string>, args: readonly string[] = []): CliResult {
  const result = spawnSync(process.execPath, ['--import', 'tsx', CLI, ...args], {
    cwd: process.cwd(),
    env: { ...process.env, ...environment },
    stdio: 'pipe',
    input: '',
    encoding: 'utf8',
  });
  return { status: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

describe('bootstrap-admin CLI (non-interactive environment)', () => {
  it('fails safely without a TTY and never touches the database', () => {
    const result = runCli({ DATABASE_URL: VALID_DATABASE_URL });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('bootstrap-admin requires an interactive terminal.');
    expect(result.stdout).not.toContain('Administrator created.');
  });

  it('requires only DATABASE_URL (PORT/CORS_ORIGINS/NODE_ENV are not needed)', () => {
    // A DATABASE_URL alone is enough to reach the terminal check (env parsed OK).
    const result = runCli({ DATABASE_URL: VALID_DATABASE_URL });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('requires an interactive terminal');
    expect(result.stderr).not.toContain('The environment is invalid');
  });

  it('blocks when DATABASE_URL is missing, without printing the value', () => {
    const result = runCli({ NODE_ENV: 'development', PORT: '3000' });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('The environment is invalid');
    expect(result.stderr).not.toContain(VALID_DATABASE_URL);
    expect(result.stderr).not.toMatch(/postgresql:\/\//);
  });

  it('rejects the --password flag', () => {
    const result = runCli({ DATABASE_URL: VALID_DATABASE_URL }, ['--password=secret-value-123']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--password flag is not supported');
    expect(result.stderr).not.toContain('secret-value-123');
  });
});
