import { Injectable, Logger } from '@nestjs/common';
import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client';

/**
 * Boundary: this service is only registered when a DATABASE_URL is configured
 * (see AppModule.register). Connection is fail-fast at boot: a real query forces
 * the pool to connect, and an unreachable database makes the process fail to
 * start (bounded by a connection timeout). On shutdown the client disconnects.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(PrismaService.name);

  constructor(databaseUrl: string) {
    const adapter = new PrismaPg({ connectionString: databaseUrl, connectionTimeoutMillis: 5000 });
    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.$queryRaw`SELECT 1`;
    } catch (error) {
      this.logger.error('Failed to connect to the database.');
      throw error;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}
