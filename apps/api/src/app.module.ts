import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import type { DynamicModule } from '@nestjs/common';

import { EnvironmentService } from './config/environment.service';
import type { Environment } from './config/environment.types';

@Module({})
export class AppModule {
  static register(environment: Environment): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          skipProcessEnv: true,
          load: [() => environment],
        }),
        ThrottlerModule.forRoot([
          {
            ttl: environment.RATE_LIMIT_TTL_MS,
            limit: environment.RATE_LIMIT_MAX,
            setHeaders: false,
          },
        ]),
      ],
      providers: [
        EnvironmentService,
        {
          provide: APP_GUARD,
          useClass: ThrottlerGuard,
        },
      ],
      exports: [EnvironmentService],
    };
  }
}
