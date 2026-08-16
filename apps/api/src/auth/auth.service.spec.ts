import 'reflect-metadata';

import { describe, expect, it, jest } from '@jest/globals';
import type { Response } from 'express';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';

import type { EnvironmentService } from '../config/environment.service';
import type { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';
import type { LoginDto } from './dto/login.dto';
import type { PasswordService } from './password.service';
import type { SessionService } from './session/session.service';

const ORIGIN = 'https://app.example.com';
const PASSWORD = 'a-strong-password-123';
const DUMMY_HASH = 'dummy-argon2id-hash-for-timing';
const REAL_HASH = 'real-argon2id-hash';

type MockAsync = jest.Mock<(...args: unknown[]) => Promise<unknown>>;
type MockSync = jest.Mock<(...args: unknown[]) => boolean>;

interface Mocks {
  prisma: {
    user: {
      findUnique: MockAsync;
      update: MockAsync;
    };
  };
  passwordService: {
    hash: MockAsync;
    verify: MockAsync;
    needsRehash: MockSync;
  };
  sessionService: {
    createSession: MockAsync;
  };
}

function buildMocks(): Mocks {
  return {
    prisma: {
      user: {
        findUnique: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
        update: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      },
    },
    passwordService: {
      hash: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      verify: jest.fn<(...args: unknown[]) => Promise<unknown>>(),
      needsRehash: jest.fn<(...args: unknown[]) => boolean>(),
    },
    sessionService: {
      createSession: jest.fn<(...args: unknown[]) => Promise<unknown>>().mockResolvedValue({
        sessionToken: 'a'.repeat(64),
        csrfToken: 'b'.repeat(64),
      }),
    },
  };
}

function buildService(mocks: Mocks): AuthService {
  const environmentService = {
    corsOrigins: [ORIGIN],
    nodeEnv: 'test',
    sessionAbsoluteTtlMs: 604_800_000,
  } as unknown as EnvironmentService;
  return new AuthService(
    mocks.prisma as unknown as PrismaService,
    mocks.passwordService as unknown as PasswordService,
    mocks.sessionService as unknown as SessionService,
    environmentService,
    DUMMY_HASH,
  );
}

function buildRes(): { cookie: jest.Mock; clearCookie: jest.Mock } {
  return { cookie: jest.fn(), clearCookie: jest.fn() };
}

function loginDto(email = 'admin@example.com'): LoginDto {
  return { email, password: PASSWORD };
}

const activeUser = {
  id: 'u1',
  email: 'admin@example.com',
  passwordHash: REAL_HASH,
  role: 'ADMIN' as const,
  status: 'ACTIVE' as const,
};

describe('AuthService.login — exactly one Argon2id verification per attempt', () => {
  it('non-existent user: exactly one verify against the dummy hash', async () => {
    const res = buildRes() as unknown as Response;
    const mocks = buildMocks();
    const service = buildService(mocks);
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    mocks.passwordService.verify.mockResolvedValue(false);

    await expect(service.login(loginDto(), res, ORIGIN, undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(mocks.passwordService.verify).toHaveBeenCalledTimes(1);
    expect(mocks.passwordService.verify).toHaveBeenCalledWith(PASSWORD, DUMMY_HASH);
    expect(mocks.passwordService.verify).not.toHaveBeenCalledWith(PASSWORD, REAL_HASH);
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('inactive user: exactly one verify against the dummy hash, not the real one', async () => {
    const res = buildRes() as unknown as Response;
    const mocks = buildMocks();
    const service = buildService(mocks);
    mocks.prisma.user.findUnique.mockResolvedValue({ ...activeUser, status: 'INACTIVE' });
    mocks.passwordService.verify.mockResolvedValue(false);

    await expect(service.login(loginDto(), res, ORIGIN, undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(mocks.passwordService.verify).toHaveBeenCalledTimes(1);
    expect(mocks.passwordService.verify).toHaveBeenCalledWith(PASSWORD, DUMMY_HASH);
    expect(mocks.passwordService.verify).not.toHaveBeenCalledWith(PASSWORD, REAL_HASH);
  });

  it('active user with wrong password: exactly one verify against the real hash', async () => {
    const res = buildRes() as unknown as Response;
    const mocks = buildMocks();
    const service = buildService(mocks);
    mocks.prisma.user.findUnique.mockResolvedValue(activeUser);
    mocks.passwordService.verify.mockResolvedValue(false);

    await expect(service.login(loginDto(), res, ORIGIN, undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(mocks.passwordService.verify).toHaveBeenCalledTimes(1);
    expect(mocks.passwordService.verify).toHaveBeenCalledWith(PASSWORD, REAL_HASH);
    expect(mocks.passwordService.verify).not.toHaveBeenCalledWith(PASSWORD, DUMMY_HASH);
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('active user with correct password: exactly one verify against the real hash and a session is created', async () => {
    const res = buildRes() as unknown as Response;
    const mocks = buildMocks();
    const service = buildService(mocks);
    mocks.prisma.user.findUnique.mockResolvedValue(activeUser);
    mocks.passwordService.verify.mockResolvedValue(true);
    mocks.passwordService.needsRehash.mockReturnValue(false);

    const result = await service.login(loginDto(), res, ORIGIN, undefined);
    expect(mocks.passwordService.verify).toHaveBeenCalledTimes(1);
    expect(mocks.passwordService.verify).toHaveBeenCalledWith(PASSWORD, REAL_HASH);
    expect(mocks.sessionService.createSession).toHaveBeenCalledTimes(1);
    expect(mocks.sessionService.createSession).toHaveBeenCalledWith('u1');
    expect(res.cookie).toHaveBeenCalledTimes(1);
    expect(result.csrfToken).toBe('b'.repeat(64));
    expect(result.user).toEqual({
      id: 'u1',
      email: 'admin@example.com',
      role: 'ADMIN',
      status: 'ACTIVE',
    });
  });

  it('a malformed stored hash falls back to a dummy verify and rejects uniformly', async () => {
    const res = buildRes() as unknown as Response;
    const mocks = buildMocks();
    const service = buildService(mocks);
    mocks.prisma.user.findUnique.mockResolvedValue(activeUser);
    mocks.passwordService.verify.mockImplementationOnce(async () => {
      throw new Error('invalid hash');
    });
    mocks.passwordService.verify.mockResolvedValueOnce(false);

    await expect(service.login(loginDto(), res, ORIGIN, undefined)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(mocks.passwordService.verify).toHaveBeenCalledTimes(2);
    expect(mocks.passwordService.verify).toHaveBeenNthCalledWith(1, PASSWORD, REAL_HASH);
    expect(mocks.passwordService.verify).toHaveBeenNthCalledWith(2, PASSWORD, DUMMY_HASH);
    expect(res.cookie).not.toHaveBeenCalled();
  });

  it('rejects a missing Origin before any database or password work', async () => {
    const res = buildRes() as unknown as Response;
    const mocks = buildMocks();
    const service = buildService(mocks);

    await expect(service.login(loginDto(), res, undefined, undefined)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
    expect(mocks.passwordService.verify).not.toHaveBeenCalled();
  });

  it('does not accept a Referer as a substitute for a missing Origin', async () => {
    const res = buildRes() as unknown as Response;
    const mocks = buildMocks();
    const service = buildService(mocks);

    await expect(
      service.login(loginDto(), res, undefined, `${ORIGIN}/login`),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(mocks.passwordService.verify).not.toHaveBeenCalled();
  });
});
