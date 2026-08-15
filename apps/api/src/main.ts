import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.disable('x-powered-by');
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3000);
  const host = '127.0.0.1';

  await app.listen(port, host);
}

void bootstrap();
