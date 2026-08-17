import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ApiClient } from '../api/client';
import type * as ApiIndex from '../api/index';

/**
 * The singleton factory reads `import.meta.env.VITE_API_BASE_URL` at bootstrap.
 * We stub the env and reset the module between tests so the assertions are
 * deterministic and never depend on a local `.env` file.
 */
function loadApiModule(): Promise<typeof ApiIndex> {
  vi.resetModules();
  return import('../api/index');
}

describe('api singleton (createApiClient / getApiClient)', () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  it('getApiClient throws a controlled error before createApiClient is called', async () => {
    const api = await loadApiModule();
    expect(() => api.getApiClient()).toThrow('O cliente de API não foi inicializado.');
  });

  it('createApiClient builds a singleton client from the injected environment', async () => {
    vi.stubEnv('VITE_API_BASE_URL', 'http://127.0.0.1:3000');
    const api = await loadApiModule();
    const client: ApiClient = api.createApiClient();
    expect(api.getApiClient()).toBe(client);
    const first = api.getApiClient();
    expect(api.getApiClient()).toBe(first);
  });
});
