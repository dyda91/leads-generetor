import 'reflect-metadata';

import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';

import { AppModule } from './app.module';
import { EnvironmentValidationError, parseEnvironment } from './config/environment.schema';
import { EnvironmentService } from './config/environment.service';
import type { Environment } from './config/environment.types';

const BIND_HOST = '127.0.0.1';

function reportEnvironmentFailure(error: unknown): void {
  if (error instanceof EnvironmentValidationError) {
    for (const issue of error.issues) {
      process.stderr.write(`[environment] ${issue.field}: ${issue.code} — ${issue.message}\n`);
    }
    return;
  }
  process.stderr.write(
    '[environment] The application failed to start due to an invalid configuration.\n',
  );
}

async function bootstrap(): Promise<void> {
  let environment: Environment;
  try {
    environment = parseEnvironment(process.env);
  } catch (error) {
    reportEnvironmentFailure(error);
    process.exit(1);
  }

  const app = await NestFactory.create<NestExpressApplication>(AppModule.register(environment));
  app.disable('x-powered-by');
  app.enableShutdownHooks();

  const environmentService = app.get(EnvironmentService);
  await app.listen(environmentService.port, BIND_HOST);
}

void bootstrap();
