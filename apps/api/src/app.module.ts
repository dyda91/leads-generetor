import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
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
      ],
      providers: [EnvironmentService],
      exports: [EnvironmentService],
    };
  }
}
