import { PrismaPg } from '@prisma/adapter-pg';
import * as readline from 'node:readline';

import { parseCliEnvironment } from '../../config/cli-environment';
import type { CliEnvironment } from '../../config/cli-environment';
import { PrismaClient } from '../../generated/prisma/client';
import { EmailValidationError } from '../email';
import { PasswordPolicyError } from '../password-policy';
import { PasswordService } from '../password.service';
import { AdminAlreadyExistsError, AdminBootstrapService } from './admin-bootstrap.service';

interface HiddenReadline {
  _writeToOutput: (value: string) => void;
}

function ask(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

/**
 * Reads a hidden value (no echo). The `_writeToOutput` override swallows every
 * write except the prompt itself. The original writer MUST be invoked with the
 * interface as `this` (Node's readline reads `this.output`), so a bare call
 * would throw. The override is always restored in the answer callback.
 */
function askHidden(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const internal = rl as unknown as HiddenReadline;
    const originalWrite = internal._writeToOutput;
    internal._writeToOutput = (value: string) => {
      if (value === prompt) {
        originalWrite.call(internal, prompt);
      }
    };
    rl.question(prompt, (answer) => {
      internal._writeToOutput = originalWrite;
      process.stdout.write('\n');
      resolve(answer);
    });
  });
}

function hasPasswordFlag(): boolean {
  return process.argv.slice(2).some((arg) => arg === '--password' || arg.startsWith('--password='));
}

function isDatabaseUnavailable(error: unknown): boolean {
  if (error === null || typeof error !== 'object') {
    return false;
  }
  const candidate = error as { name?: unknown; code?: unknown };
  return (
    candidate.name === 'PrismaClientInitializationError' ||
    candidate.code === 'P1001' ||
    candidate.code === 'P1002'
  );
}

function writeControlledFailure(error: unknown): void {
  if (isDatabaseUnavailable(error)) {
    process.stderr.write('The database is unavailable; the administrator could not be created.\n');
  } else if (error instanceof AdminAlreadyExistsError) {
    process.stderr.write('An administrator already exists.\n');
  } else if (error instanceof EmailValidationError) {
    process.stderr.write('The e-mail is invalid.\n');
  } else if (error instanceof PasswordPolicyError) {
    process.stderr.write('The password does not meet the policy.\n');
  } else {
    process.stderr.write('The administrator could not be created.\n');
  }
}

async function main(): Promise<void> {
  let exitCode = 1;
  let prisma: PrismaClient | undefined;
  let rl: readline.Interface | undefined;
  let cleanupStarted = false;

  if (hasPasswordFlag()) {
    process.stderr.write(
      'Passwords must be entered interactively; the --password flag is not supported.\n',
    );
    process.exit(1);
  }

  let environment: CliEnvironment;
  try {
    environment = parseCliEnvironment(process.env);
  } catch {
    process.stderr.write('The environment is invalid; the administrator could not be created.\n');
    process.exit(1);
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write('bootstrap-admin requires an interactive terminal.\n');
    process.exit(1);
  }

  const cleanup = (): void => {
    if (cleanupStarted) {
      return;
    }
    cleanupStarted = true;
    if (rl !== undefined) {
      rl.removeListener('SIGINT', onSigint);
      rl.removeListener('close', onClose);
      rl.close();
    }
    process.removeListener('SIGTERM', onSigterm);
    try {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
    } catch {
      // raw mode already disabled
    }
  };

  const onSigint = (): void => {
    cleanup();
    process.exit(130);
  };
  const onSigterm = (): void => {
    cleanup();
    process.exit(143);
  };
  const onClose = (): void => {
    if (!cleanupStarted) {
      process.stderr.write('The input was interrupted; the administrator was not created.\n');
      process.exit(1);
    }
  };

  try {
    const adapter = new PrismaPg({
      connectionString: environment.databaseUrl,
      connectionTimeoutMillis: 5000,
    });
    prisma = new PrismaClient({ adapter });
    const passwords = new PasswordService(environment.argon2Options);
    const bootstrap = new AdminBootstrapService(prisma, passwords);

    if (process.stdin.isPaused()) {
      process.stdin.resume();
    }
    rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.on('SIGINT', onSigint);
    rl.on('close', onClose);
    process.on('SIGTERM', onSigterm);

    const rawEmail = await ask(rl, 'Admin e-mail: ');
    const password = await askHidden(rl, 'Password (hidden): ');
    const confirmation = await askHidden(rl, 'Confirm password (hidden): ');

    if (password === confirmation) {
      await bootstrap.createAdmin(rawEmail, password);
      process.stdout.write('Administrator created.\n');
      exitCode = 0;
    } else {
      process.stderr.write('The password confirmation does not match.\n');
    }
  } catch (error) {
    writeControlledFailure(error);
  } finally {
    cleanup();
    if (prisma !== undefined) {
      await prisma.$disconnect();
    }
  }
  process.exit(exitCode);
}

void main();
