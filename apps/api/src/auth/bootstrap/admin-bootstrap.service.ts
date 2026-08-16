import type { PrismaClient } from '../../generated/prisma/client';
import { normalizeEmail } from '../email';
import { assertPasswordPolicy } from '../password-policy';
import type { PasswordService } from '../password.service';

export class AdminAlreadyExistsError extends Error {
  constructor() {
    super('An administrator already exists.');
    this.name = 'AdminAlreadyExistsError';
  }
}

/**
 * Business rules for bootstrapping the single administrator. Runs in a
 * transaction and relies on the database's single-admin unique index so
 * concurrent bootstraps yield exactly one admin; the losing transaction is
 * mapped to a controlled error (never a Prisma error or constraint name).
 */
export class AdminBootstrapService {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly passwords: PasswordService,
  ) {}

  async createAdmin(rawEmail: string, password: string): Promise<void> {
    const email = normalizeEmail(rawEmail);
    assertPasswordPolicy(password);
    const passwordHash = await this.passwords.hash(password);

    try {
      await this.prisma.$transaction(async (tx) => {
        const existing = await tx.user.findFirst({ where: { role: 'ADMIN' } });
        if (existing !== null) {
          throw new AdminAlreadyExistsError();
        }
        await tx.user.create({
          data: {
            email,
            passwordHash,
            role: 'ADMIN',
            status: 'ACTIVE',
            passwordChangedAt: new Date(),
          },
        });
      });
    } catch (error) {
      if (error instanceof AdminAlreadyExistsError) {
        throw error;
      }
      if (isUniqueConstraintError(error)) {
        throw new AdminAlreadyExistsError();
      }
      throw error;
    }
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
