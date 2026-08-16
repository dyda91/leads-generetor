import 'reflect-metadata';

import { BadRequestException } from '@nestjs/common';
import type { ArgumentMetadata } from '@nestjs/common';

import { describe, expect, it } from '@jest/globals';

import { LoginDto } from '../src/auth/dto/login.dto';
import { createValidationPipe } from '../src/http/validation-pipe';

const pipe = createValidationPipe();

const BODY_METADATA: ArgumentMetadata = { type: 'body', metatype: LoginDto, data: undefined };

async function validateBody(body: unknown): Promise<LoginDto> {
  return (await pipe.transform(body, BODY_METADATA)) as LoginDto;
}

async function expectValidationError(body: unknown): Promise<BadRequestException> {
  let thrown: unknown;
  try {
    await validateBody(body);
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

  it('rejects an invalid email', async () => {
    await expectValidationError({ email: 'not-an-email', password: 'a-strong-password-123' });
  });

  it('rejects an oversized email', async () => {
    await expectValidationError({
      email: `${'a'.repeat(250)}@example.com`,
      password: 'a-strong-password-123',
    });
  });

  it('rejects a short password', async () => {
    await expectValidationError({ email: 'admin@example.com', password: 'short' });
  });

  it('rejects an oversized password before any hashing', async () => {
    await expectValidationError({ email: 'admin@example.com', password: 'x'.repeat(200) });
  });

  it('rejects a non-string password', async () => {
    await expectValidationError({ email: 'admin@example.com', password: 12345 });
  });

  it('rejects unknown and administrative properties', async () => {
    const error = await expectValidationError({
      email: 'admin@example.com',
      password: 'a-strong-password-123',
      role: 'SUPER_ADMIN',
      userId: 'u1',
      status: 'ACTIVE',
      sessionId: 's1',
      extra: 'x',
    });
    const body = JSON.stringify(error.getResponse());
    expect(body).not.toContain('SUPER_ADMIN');
    expect(body).not.toContain('s1');
  });

  it('never includes the password value in validation errors', async () => {
    const error = await expectValidationError({
      email: 'admin@example.com',
      password: 'x'.repeat(200),
    });
    const body = JSON.stringify(error.getResponse());
    expect(body).not.toContain('x'.repeat(200));
  });
});
