import 'reflect-metadata';

import { describe, expect, it } from '@jest/globals';
import { Test } from '@nestjs/testing';

import { AppModule } from '../src/app.module';

describe('AppModule', () => {
  it('compiles the NestJS module without opening a public port', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();

    expect(moduleRef).toBeDefined();

    await moduleRef.close();
  });
});
