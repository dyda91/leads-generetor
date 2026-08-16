import 'reflect-metadata';

import { BadRequestException } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';

import { describe, expect, it } from '@jest/globals';

import { ChangePasswordDto } from '../src/auth/dto/change-password.dto';
import { LoginDto } from '../src/auth/dto/login.dto';
import { createValidationPipe } from '../src/http/validation-pipe';

const pipe = createValidationPipe();

const LOGIN_METADATA: ArgumentMetadata = { type: 'body', metatype: LoginDto, data: undefined };
const CHANGE_PASSWORD_METADATA: ArgumentMetadata = {
  type: 'body',
  metatype: ChangePasswordDto,
  data: undefined,
};

async function validateBody(body: unknown): Promise<LoginDto> {
  return (await pipe.transform(body, LOGIN_METADATA)) as LoginDto;
}

async function validateChangePassword(body: unknown): Promise<ChangePasswordDto> {
  return (await pipe.transform(body, CHANGE_PASSWORD_METADATA)) as ChangePasswordDto;
}

async function expectValidationError(
  validate: () => Promise<unknown>,
): Promise<BadRequestException> {
  let thrown: unknown;
  try {
    await validate();
    throw new Error('Expected validation to fail');
  } catch (error) {
    thrown = error;
  }
  expect(thrown).toBeInstanceOf(BadRequestException);
  return thrown as BadRequestException;
}

describe('LoginDto (strict validation)', () => {
  it('accepts a valid email and password', async () => {
    const dto = await validateBody({
      email: 'admin@example.com',
      password: 'a-strong-password-123',
    });
    expect(dto.email).toBe('admin@example.com');
  });

  it('accepts a one-character password attempt (no strong policy at login)', async () => {
    const dto = await validateBody({ email: 'admin@example.com', password: 'a' });
    expect(dto.password).toBe('a');
  });

  it('rejects an empty password', () => {
    expectValidationError(() => validateBody({ email: 'admin@example.com', password: '' }));
  });

  it('rejects an oversized password (above 128) before any hashing', () => {
    expectValidationError(() =>
      validateBody({ email: 'admin@example.com', password: 'x'.repeat(200) }),
    );
  });

  it('rejects an invalid email', () => {
    expectValidationError(() =>
      validateBody({ email: 'not-an-email', password: 'a-strong-password-123' }),
    );
  });

  it('rejects an oversized email', () => {
    expectValidationError(() =>
      validateBody({ email: `${'a'.repeat(250)}@example.com`, password: 'a-strong-password-123' }),
    );
  });

  it('rejects a non-string password', () => {
    expectValidationError(() => validateBody({ email: 'admin@example.com', password: 12345 }));
  });

  it('does not trim or normalize the password', async () => {
    const password = '  a-strong-password  ';
    const dto = await validateBody({ email: 'admin@example.com', password });
    expect(dto.password).toBe(password);
  });

  it('rejects unknown and administrative properties', async () => {
    const error = await expectValidationError(() =>
      validateBody({
        email: 'admin@example.com',
        password: 'a-strong-password-123',
        role: 'SUPER_ADMIN',
        userId: 'u1',
        status: 'ACTIVE',
        sessionId: 's1',
        extra: 'x',
      }),
    );
    const body = JSON.stringify(error.getResponse());
    expect(body).not.toContain('SUPER_ADMIN');
    expect(body).not.toContain('s1');
  });

  it('never includes the password value in validation errors', async () => {
    const error = await expectValidationError(() =>
      validateBody({ email: 'admin@example.com', password: 'x'.repeat(200) }),
    );
    const body = JSON.stringify(error.getResponse());
    expect(body).not.toContain('x'.repeat(200));
  });
});

describe('ChangePasswordDto (strict validation)', () => {
  const valid = { currentPassword: 'current-password', newPassword: 'a-new-password-123' };

  it('accepts valid current and new passwords', async () => {
    const dto = await validateChangePassword(valid);
    expect(dto.newPassword).toBe(valid.newPassword);
  });

  it('accepts a one-character current password', async () => {
    const dto = await validateChangePassword({ ...valid, currentPassword: 'a' });
    expect(dto.currentPassword).toBe('a');
  });

  it('rejects an empty current password', () => {
    expectValidationError(() => validateChangePassword({ ...valid, currentPassword: '' }));
  });

  it('rejects a new password shorter than 12 characters', () => {
    expectValidationError(() => validateChangePassword({ ...valid, newPassword: 'short' }));
  });

  it('accepts a new password of exactly 12 characters', async () => {
    const dto = await validateChangePassword({ ...valid, newPassword: 'a'.repeat(12) });
    expect(dto.newPassword).toBe('a'.repeat(12));
  });

  it('rejects an oversized new password', () => {
    expectValidationError(() => validateChangePassword({ ...valid, newPassword: 'x'.repeat(200) }));
  });

  it('does not trim or normalize passwords', async () => {
    const currentPassword = ' current ';
    const newPassword = ' a-new-password ';
    const dto = await validateChangePassword({ currentPassword, newPassword });
    expect(dto.currentPassword).toBe(currentPassword);
    expect(dto.newPassword).toBe(newPassword);
  });

  it('rejects unknown and administrative properties', async () => {
    const error = await expectValidationError(() =>
      validateChangePassword({ ...valid, role: 'ADMIN', userId: 'u1', status: 'ACTIVE' }),
    );
    const body = JSON.stringify(error.getResponse());
    expect(body).not.toContain('ADMIN');
    expect(body).not.toContain('u1');
  });
});
