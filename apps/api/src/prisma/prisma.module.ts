import { Module } from '@nestjs/common';
import type { DynamicModule } from '@nestjs/common';

import { PrismaService } from './prisma.service';

@Module({})
export class PrismaModule {
  static register(databaseUrl: string): DynamicModule {
    return {
      module: PrismaModule,
      global: true,
      providers: [
        {
          provide: PrismaService,
          useFactory: () => new PrismaService(databaseUrl),
        },
      ],
      exports: [PrismaService],
    };
  }
}
