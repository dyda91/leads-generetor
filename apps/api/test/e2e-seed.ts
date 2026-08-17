import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client';
import { PasswordService } from '../src/auth/password.service';
import { AdminBootstrapService } from '../src/auth/bootstrap/admin-bootstrap.service';
import { validateTestDatabaseUrl } from './test-db-guard';

const ARGON2_OPTIONS = { memoryCost: 19_456, timeCost: 2, parallelism: 1, hashLength: 32 } as const;

interface SeedEnv {
  databaseUrl: string;
  email?: string | undefined;
  password?: string | undefined;
  cleanupOnly: boolean;
}

function readSeedEnv(): SeedEnv {
  const databaseUrl = process.env.DATABASE_URL_TEST;
  validateTestDatabaseUrl(databaseUrl);
  const cleanupOnly = process.argv.slice(2).includes('--cleanup');
  const checkOnly = process.argv.slice(2).includes('--check');
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!cleanupOnly && !checkOnly && (email === undefined || password === undefined)) {
    throw new Error('E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD are required for seeding.');
  }
  return { databaseUrl: databaseUrl ?? '', email, password, cleanupOnly };
}

function reportFailure(error: unknown): void {
  if (error instanceof Error && error.message.length > 0) {
    process.stderr.write(`[e2e-seed] ${error.message}\n`);
  } else {
    process.stderr.write('[e2e-seed] The E2E seed failed.\n');
  }
}

/**
 * Secure E2E seed: creates exactly one administrator on the isolated test
 * database. It validates DATABASE_URL_TEST with the existing guard, resets the
 * isolated test database (users + sessions only) for determinism, and creates
 * the admin in-process via AdminBootstrapService. With `--cleanup` it only
 * wipes users/sessions. It never prints the password, hash, cookie, CSRF or
 * connection string, and never touches the development database (5433).
 */
async function main(): Promise<void> {
  let exitCode = 1;
  let prisma: PrismaClient | undefined;
  try {
    const env = readSeedEnv();
    if (process.argv.slice(2).includes('--check')) {
      // Validation only: DATABASE_URL_TEST was already validated by the guard in
      // readSeedEnv. Used by the webServer bootstrap before migrations start.
      process.exit(0);
    }
    const adapter = new PrismaPg({
      connectionString: env.databaseUrl,
      connectionTimeoutMillis: 5000,
    });
    prisma = new PrismaClient({ adapter });
    await prisma.$connect();

    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({});

    if (!env.cleanupOnly) {
      const service = new AdminBootstrapService(prisma, new PasswordService(ARGON2_OPTIONS));
      await service.createAdmin(env.email ?? '', env.password ?? '');
    }
    exitCode = 0;
  } catch (error) {
    reportFailure(error);
  } finally {
    if (prisma !== undefined) {
      await prisma.$disconnect();
    }
  }
  process.exit(exitCode);
}

void main();
