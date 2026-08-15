import 'reflect-metadata';

import { spawn, execFileSync } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

import { afterAll, beforeAll, describe, expect, it } from '@jest/globals';

const rootDir = path.resolve(__dirname, '..');
const entryPath = path.join(rootDir, 'dist', 'main.js');
const runningChildren: ChildProcess[] = [];

function buildApi(): void {
  const tscBin = path.join(rootDir, 'node_modules', 'typescript', 'bin', 'tsc');
  execFileSync(process.execPath, [tscBin, '-p', 'tsconfig.build.json'], {
    cwd: rootDir,
    stdio: 'ignore',
  });
}

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        server.close();
        reject(new Error('Could not allocate an ephemeral port.'));
        return;
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

function spawnApi(env: Record<string, string>): ChildProcess {
  const child = spawn(process.execPath, [entryPath], {
    cwd: rootDir,
    env: { ...process.env, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  runningChildren.push(child);
  return child;
}

function waitForExit(child: ChildProcess, timeoutMs: number): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('The child process did not exit within the timeout.'));
    }, timeoutMs);
    child.once('exit', (code) => {
      clearTimeout(timer);
      resolve(code);
    });
  });
}

async function waitForListening(port: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const connected = await new Promise<boolean>((resolve) => {
      const socket = net.connect({ host: '127.0.0.1', port });
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => resolve(false));
    });
    if (connected) {
      return;
    }
    await delay(150);
  }
  throw new Error(`The API did not start listening on 127.0.0.1:${port} within ${timeoutMs}ms.`);
}

async function isPortOpen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    socket.once('connect', () => {
      socket.destroy();
      resolve(true);
    });
    socket.once('error', () => resolve(false));
  });
}

afterAll(() => {
  for (const child of runningChildren) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
    }
  }
});

describe('bootstrap process', () => {
  beforeAll(() => {
    buildApi();
  });

  it('exits with a safe error and without opening a socket when the configuration is invalid', async () => {
    const port = await freePort();
    const child = spawnApi({ NODE_ENV: 'staging', PORT: String(port) });

    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    const exitCode = await waitForExit(child, 10000);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('NODE_ENV');
    expect(stderr).not.toContain('staging');

    await expect(isPortOpen(port)).resolves.toBe(false);
  }, 20000);

  it('exits without opening a socket when the rate limit configuration is invalid', async () => {
    const port = await freePort();
    const child = spawnApi({ NODE_ENV: 'test', PORT: String(port), RATE_LIMIT_MAX: '0' });

    let stderr = '';
    child.stderr?.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    const exitCode = await waitForExit(child, 10000);

    expect(exitCode).toBe(1);
    expect(stderr).toContain('RATE_LIMIT_MAX');
    expect(stderr).not.toContain('0');

    await expect(isPortOpen(port)).resolves.toBe(false);
  }, 20000);

  it('boots and listens on the configured loopback port with a valid configuration', async () => {
    const port = await freePort();
    const child = spawnApi({ NODE_ENV: 'development', PORT: String(port) });

    try {
      await waitForListening(port, 15000);
    } finally {
      if (child.exitCode === null && child.signalCode === null) {
        child.kill('SIGTERM');
      }
    }

    await waitForExit(child, 10000);
  }, 30000);
});
