import 'reflect-metadata';

import { afterAll, afterEach, beforeAll, describe, expect, it } from '@jest/globals';
import { PrismaPg } from '@prisma/adapter-pg';

import {
  AdminAlreadyExistsError,
  AdminBootstrapService,
} from '../src/auth/bootstrap/admin-bootstrap.service';
import type { Argon2Options } from '../src/auth/argon2-options';
import { PasswordService } from '../src/auth/password.service';
import { PrismaClient } from '../src/generated/prisma/client';
import { validateTestDatabaseUrl } from './test-db-guard';

const TEST_URL = process.env.DATABASE_URL_TEST ?? '';

const argon2Options: Argon2Options = {
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
  hashLength: 32,
};

let prisma: PrismaClient;
let service: AdminBootstrapService;

beforeAll(async () => {
  validateTestDatabaseUrl(TEST_URL);
  const adapter = new PrismaPg({ connectionString: TEST_URL });
  prisma = new PrismaClient({ adapter });
  await prisma.$connect();
  service = new AdminBootstrapService(prisma, new PasswordService(argon2Options));
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

describe('AdminBootstrapService (isolated test database)', () => {
  it('creates the first admin as ADMIN/ACTIVE with passwordChangedAt and an Argon2id hash', async () => {
    await service.createAdmin('Admin@Example.com', 'a-strong-password-123');

    const user = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    expect(user).not.toBeNull();
    expect(user?.email).toBe('admin@example.com');
    expect(user?.role).toBe('ADMIN');
    expect(user?.status).toBe('ACTIVE');
    expect(user?.passwordChangedAt).not.toBeNull();
    expect(user?.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user?.passwordHash).not.toContain('a-strong-password-123');
  });

  it('does not create a session or CSRF token', async () => {
    await service.createAdmin('admin2@example.com', 'a-strong-password-123');
    expect(await prisma.session.count()).toBe(0);
  });

  it('rejects a second admin with a controlled error', async () => {
    await service.createAdmin('admin@example.com', 'a-strong-password-123');
    await expect(
      service.createAdmin('other@example.com', 'a-strong-password-123'),
    ).rejects.toBeInstanceOf(AdminAlreadyExistsError);
    expect(await prisma.user.count({ where: { role: 'ADMIN' } })).toBe(1);
  });

  it('does not reveal constraint or Prisma details in the controlled error', async () => {
    await service.createAdmin('admin@example.com', 'a-strong-password-123');
    let message = '';
    try {
      await service.createAdmin('other@example.com', 'a-strong-password-123');
    } catch (error) {
      message = error instanceof Error ? error.message : String(error);
    }
    expect(message).not.toMatch(/users_single_admin/i);
    expect(message).not.toMatch(/P2002/i);
    expect(message).not.toMatch(/Prisma/i);
  });

  it('rejects a second ADMIN at the database level directly', async () => {
    await service.createAdmin('admin@example.com', 'a-strong-password-123');
    await expect(
      prisma.user.create({
        data: {
          id: 'u_direct',
          email: 'direct@example.com',
          passwordHash: 'not-a-real-hash',
          role: 'ADMIN',
          status: 'ACTIVE',
          passwordChangedAt: new Date(),
          updatedAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it('leaves exactly one admin under concurrent bootstraps', async () => {
    const results = await Promise.allSettled([
      service.createAdmin('admin@example.com', 'a-strong-password-123'),
      service.createAdmin('other@example.com', 'a-strong-password-123'),
    ]);
    const fulfilled = results.filter((result) => result.status === 'fulfilled').length;
    const controlledRejections = results.filter(
      (result) => result.status === 'rejected' && result.reason instanceof AdminAlreadyExistsError,
    ).length;
    expect(fulfilled).toBe(1);
    expect(controlledRejections).toBe(1);
    expect(await prisma.user.count({ where: { role: 'ADMIN' } })).toBe(1);
  });

  it('rejects an invalid e-mail and a policy-violating password without side effects', async () => {
    await expect(service.createAdmin('not-an-email', 'a-strong-password-123')).rejects.toThrow();
    await expect(service.createAdmin('admin@example.com', 'short')).rejects.toThrow();
    expect(await prisma.user.count()).toBe(0);
  });
});
