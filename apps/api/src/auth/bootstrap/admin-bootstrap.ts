import { PrismaPg } from '@prisma/adapter-pg';
import * as readline from 'node:readline';

import { parseEnvironment } from '../../config/environment.schema';
import type { Environment } from '../../config/environment.types';
import { PrismaClient } from '../../generated/prisma/client';
import { environmentToArgon2Options } from '../argon2-options';
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

function askHidden(rl: readline.Interface, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const internal = rl as unknown as HiddenReadline;
    const originalWrite = internal._writeToOutput;
    internal._writeToOutput = (value: string) => {
      if (value === prompt) {
        originalWrite(prompt);
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

async function main(): Promise<void> {
  let exitCode = 1;
  let prisma: PrismaClient | undefined;
  let rl: readline.Interface | undefined;

  const restoreTerminal = (): void => {
    if (rl !== undefined) {
      rl.close();
    }
    try {
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
    } catch {
      // raw mode already disabled
    }
  };

  const onSigint = (): void => {
    restoreTerminal();
    process.exit(130);
  };
  const onSigterm = (): void => {
    restoreTerminal();
    process.exit(143);
  };

  if (hasPasswordFlag()) {
    process.stderr.write(
      'Passwords must be entered interactively; the --password flag is not supported.\n',
    );
    process.exit(1);
  }

  let environment: Environment;
  try {
    environment = parseEnvironment(process.env);
  } catch {
    process.stderr.write('The environment is invalid; the administrator could not be created.\n');
    process.exit(1);
  }

  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    process.stderr.write('bootstrap-admin requires an interactive terminal.\n');
    process.exit(1);
  }

  try {
    const adapter = new PrismaPg({
      connectionString: environment.DATABASE_URL,
      connectionTimeoutMillis: 5000,
    });
    prisma = new PrismaClient({ adapter });
    const passwords = new PasswordService(environmentToArgon2Options(environment));
    const bootstrap = new AdminBootstrapService(prisma, passwords);

    rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    rl.on('SIGINT', onSigint);
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
    if (error instanceof AdminAlreadyExistsError) {
      process.stderr.write('An administrator already exists.\n');
    } else if (error instanceof EmailValidationError) {
      process.stderr.write('The e-mail is invalid.\n');
    } else if (error instanceof PasswordPolicyError) {
      process.stderr.write('The password does not meet the policy.\n');
    } else {
      process.stderr.write('The administrator could not be created.\n');
    }
  } finally {
    restoreTerminal();
    if (prisma !== undefined) {
      await prisma.$disconnect();
    }
  }
  process.exit(exitCode);
}

void main();
