import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import type { Environment, NodeEnv } from './environment.types';

@Injectable()
export class EnvironmentService {
  private readonly environment: Environment;

  constructor(@Inject(ConfigService) config: ConfigService) {
    const nodeEnv = config.get<NodeEnv>('NODE_ENV');
    const port = config.get<number>('PORT');
    const corsOrigins = config.get<readonly string[]>('CORS_ORIGINS');

    if (nodeEnv === undefined || port === undefined || corsOrigins === undefined) {
      throw new Error('Validated environment is not available.');
    }

    this.environment = { NODE_ENV: nodeEnv, PORT: port, CORS_ORIGINS: corsOrigins };
  }

  get nodeEnv(): NodeEnv {
    return this.environment.NODE_ENV;
  }

  get port(): number {
    return this.environment.PORT;
  }

  get corsOrigins(): readonly string[] {
    return this.environment.CORS_ORIGINS;
  }

  get isProduction(): boolean {
    return this.environment.NODE_ENV === 'production';
  }
}
