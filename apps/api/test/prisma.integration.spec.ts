import 'reflect-metadata';

import { Test } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaModule } from '../src/prisma/prisma.module';
import { validateTestDatabaseUrl } from './test-db-guard';

const TEST_URL = process.env.DATABASE_URL_TEST ?? '';

let prisma: PrismaClient;

function future(): Date {
  return new Date(Date.now() + 60_000);
}

async function createUser(email: string, id: string): Promise<void> {
  await prisma.user.create({
    data: { id, email, passwordHash: 'not-a-real-hash', updatedAt: new Date() },
  });
}

async function createSession(
  id: string,
  userId: string,
  tokenHash: string,
  csrfTokenHash: string,
  expiresAt: Date = future(),
): Promise<void> {
  await prisma.session.create({
    data: {
      id,
      userId,
      tokenHash,
      csrfTokenHash,
      expiresAt,
      lastUsedAt: new Date(),
    },
  });
}

beforeAll(async () => {
  validateTestDatabaseUrl(TEST_URL);
  const adapter = new PrismaPg({ connectionString: TEST_URL });
  prisma = new PrismaClient({ adapter });
  await prisma.$connect();
});

afterEach(async () => {
  if (prisma !== undefined) {
    await prisma.session.deleteMany({});
    await prisma.user.deleteMany({});
  }
});

afterAll(async () => {
  if (prisma !== undefined) {
    await prisma.$disconnect();
  }
});

describe('Prisma schema (isolated test database)', () => {
  it('created the expected tables and enums', async () => {
    const tables = (
      await prisma.$queryRaw<Array<{ tablename: string }>>`
        SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public'
      `
    ).map((row) => row.tablename);
    expect(tables).toEqual(expect.arrayContaining(['users', 'sessions']));

    const enums = (
      await prisma.$queryRaw<Array<{ typname: string }>>`
        SELECT typname FROM pg_catalog.pg_type WHERE typname IN ('UserRole', 'UserStatus')
      `
    ).map((row) => row.typname);
    expect(enums).toEqual(expect.arrayContaining(['UserRole', 'UserStatus']));
  });

  it('exposes only the allowed columns', async () => {
    const columns = (
      await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
        SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name IN ('users', 'sessions')
      `
    ).map((row) => `${row.table_name}.${row.column_name}`);

    expect(columns).toEqual(
      expect.arrayContaining([
        'users.id',
        'users.email',
        'users.passwordHash',
        'users.role',
        'users.status',
        'users.passwordChangedAt',
        'users.createdAt',
        'users.updatedAt',
        'sessions.id',
        'sessions.userId',
        'sessions.tokenHash',
        'sessions.csrfTokenHash',
        'sessions.expiresAt',
        'sessions.lastUsedAt',
        'sessions.revokedAt',
        'sessions.createdAt',
      ]),
    );

    const columnNames = columns.map((column) => column.split('.')[1] ?? column);
    const forbiddenColumns = [
      'password',
      'token',
      'sessionToken',
      'userAgent',
      'user_agent',
      'cookie',
      'ip',
      'payload',
      'requestBody',
      'header',
      'headers',
    ];
    for (const needle of forbiddenColumns) {
      expect(columnNames).not.toContain(needle);
    }
  });

  it('applies the default enum values', async () => {
    await createUser('defaults@example.com', 'u_defaults');
    const user = await prisma.user.findUnique({ where: { id: 'u_defaults' } });
    expect(user?.role).toBe('ADMIN');
    expect(user?.status).toBe('ACTIVE');
  });

  it('enforces a unique email', async () => {
    await createUser('unique@example.com', 'u_a');
    await expect(createUser('unique@example.com', 'u_b')).rejects.toThrow();
  });

  it('rejects a non-normalized email at the database level', async () => {
    await expect(
      prisma.user.create({
        data: {
          id: 'u_mixed',
          email: 'Mixed@Example.com ',
          passwordHash: 'h',
          updatedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it('enforces unique tokenHash and csrfTokenHash', async () => {
    await createUser('hashes@example.com', 'u_hashes');
    await createSession('s_h1', 'u_hashes', 'th1', 'ch1');

    await expect(createSession('s_h2', 'u_hashes', 'th2', 'ch1')).rejects.toThrow();
    await expect(createSession('s_h3', 'u_hashes', 'th1', 'ch2')).rejects.toThrow();
  });

  it('enforces the foreign key from sessions to users', async () => {
    await expect(
      prisma.session.create({
        data: {
          id: 's_missing',
          userId: 'does-not-exist',
          tokenHash: 'th_missing',
          csrfTokenHash: 'ch_missing',
          expiresAt: future(),
          lastUsedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it('allows at most one non-revoked session per user', async () => {
    await createUser('active@example.com', 'u_active');
    await createSession('sa1', 'u_active', 'ta1', 'ca1');
    await expect(createSession('sa2', 'u_active', 'ta2', 'ca2')).rejects.toThrow();
  });

  it('a revoked session allows creating a new one', async () => {
    await createUser('revoked@example.com', 'u_rev');
    await createSession('sr1', 'u_rev', 'tr1', 'cr1');
    await prisma.session.update({ where: { id: 'sr1' }, data: { revokedAt: new Date() } });
    await createSession('sr2', 'u_rev', 'tr2', 'cr2');

    const active = await prisma.session.count({ where: { userId: 'u_rev', revokedAt: null } });
    expect(active).toBe(1);
  });

  it('an expired non-revoked session must be revoked before a new session', async () => {
    await createUser('expired@example.com', 'u_exp');
    await createSession('se1', 'u_exp', 'te1', 'ce1', new Date(Date.now() - 60_000));

    await expect(createSession('se2', 'u_exp', 'te2', 'ce2')).rejects.toThrow();

    await prisma.session.update({ where: { id: 'se1' }, data: { revokedAt: new Date() } });
    await createSession('se3', 'u_exp', 'te3', 'ce3');

    const active = await prisma.session.count({ where: { userId: 'u_exp', revokedAt: null } });
    expect(active).toBe(1);
  });

  it('concurrent creates leave exactly one non-revoked session', async () => {
    await createUser('concurrent@example.com', 'u_conc');
    const results = await Promise.allSettled([
      prisma.session.create({
        data: {
          id: 'cc1',
          userId: 'u_conc',
          tokenHash: 'tc1',
          csrfTokenHash: 'cc1',
          expiresAt: future(),
          lastUsedAt: new Date(),
        },
      }),
      prisma.session.create({
        data: {
          id: 'cc2',
          userId: 'u_conc',
          tokenHash: 'tc2',
          csrfTokenHash: 'cc2',
          expiresAt: future(),
          lastUsedAt: new Date(),
        },
      }),
    ]);

    const fulfilled = results.filter((result) => result.status === 'fulfilled').length;
    expect(fulfilled).toBe(1);

    const active = await prisma.session.count({ where: { userId: 'u_conc', revokedAt: null } });
    expect(active).toBe(1);
  });

  it('stores all timestamps with timezone', async () => {
    const naive = await prisma.$queryRaw<Array<{ table_name: string; column_name: string }>>`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name IN ('users', 'sessions')
        AND data_type = 'timestamp without time zone'
    `;
    expect(naive).toEqual([]);
  });
});

describe('Prisma integration with NestJS', () => {
  it('disconnects the client on application shutdown', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [PrismaModule.register(TEST_URL)],
    }).compile();
    const app = moduleRef.createNestApplication();
    await app.init();
    await app.close();
  });
});
