import 'reflect-metadata';

import { spawnSync } from 'node:child_process';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

import { loadTestDatabaseUrl } from './helpers';

const rootDir = path.resolve(__dirname, '..');
const tsxCli = path.join(rootDir, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const script = path.join(rootDir, 'src', 'auth', 'bootstrap', 'admin-bootstrap.ts');

function runCli(
  args: string[],
  env: NodeJS.ProcessEnv = {},
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, [tsxCli, script, ...args], {
    cwd: rootDir,
    input: '',
    env: { ...process.env, ...env },
    encoding: 'utf8',
    timeout: 30_000,
  });
  return { status: result.status, stdout: result.stdout ?? '', stderr: result.stderr ?? '' };
}

describe('bootstrap-admin CLI', () => {
  it('rejects the --password flag', () => {
    const result = runCli(['--password=some-password-value']);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('--password');
  });

  it('rejects non-interactive execution when there is no TTY', () => {
    const result = runCli([], {
      NODE_ENV: 'test',
      PORT: '3000',
      DATABASE_URL: loadTestDatabaseUrl(),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('interactive terminal');
  });

  it('never leaks the password or connection details in output', () => {
    const result = runCli(['--password=some-password-value']);
    const output = result.stdout + result.stderr;
    expect(output).not.toContain('some-password-value');
    expect(output).not.toContain('postgresql://');
  });
});
