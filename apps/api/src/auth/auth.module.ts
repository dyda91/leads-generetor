import { randomBytes } from 'node:crypto';

import { Module } from '@nestjs/common';

import { EnvironmentService } from '../config/environment.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthController } from './auth.controller';
import { AuthGuard } from './auth.guard';
import { AuthService } from './auth.service';
import { DUMMY_PASSWORD_HASH } from './auth.constants';
import { PasswordService } from './password.service';
import type { Argon2Options } from './argon2-options';
import { SessionService } from './session/session.service';
import { systemClock } from './system-clock';

@Module({
  controllers: [AuthController],
  providers: [
    EnvironmentService,
    {
      provide: SessionService,
      useFactory: (prisma: PrismaService, environment: EnvironmentService) =>
        new SessionService(prisma, systemClock, {
          absoluteTtlMs: environment.sessionAbsoluteTtlMs,
          idleTtlMs: environment.sessionIdleTtlMs,
          touchIntervalMs: environment.sessionTouchIntervalMs,
        }),
      inject: [PrismaService, EnvironmentService],
    },
    {
      provide: PasswordService,
      useFactory: (environment: EnvironmentService): PasswordService => {
        const options: Argon2Options = {
          memoryCost: environment.argon2MemoryCost,
          timeCost: environment.argon2TimeCost,
          parallelism: environment.argon2Parallelism,
          hashLength: environment.argon2HashLength,
        };
        return new PasswordService(options);
      },
      inject: [EnvironmentService],
    },
    {
      // In-memory dummy Argon2id hash, created once per instance with the same
      // current parameters, from a CSPRNG input. Login verifies unknown/inactive
      // users against it so the timing signal does not reveal account existence.
      // A failure to generate blocks boot safely (fail-fast). Never stored or logged.
      provide: DUMMY_PASSWORD_HASH,
      useFactory: async (passwordService: PasswordService): Promise<string> => {
        const dummyInput = randomBytes(32).toString('hex');
        return passwordService.hash(dummyInput);
      },
      inject: [PasswordService],
    },
    AuthService,
    AuthGuard,
  ],
  exports: [AuthService, AuthGuard, SessionService, PasswordService, DUMMY_PASSWORD_HASH],
})
export class AuthModule {}
