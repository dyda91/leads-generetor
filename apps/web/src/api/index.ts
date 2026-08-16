import { ApiClient } from './client';
import { resolveApiClientConfig } from './config';
import { ApiError } from './errors';

let instance: ApiClient | undefined;

/**
 * Cria (uma vez) o cliente de API a partir da `VITE_API_BASE_URL` pública,
 * injetada pelo Vite durante dev/build, e valida essa configuração no bootstrap
 * do frontend (sobre o valor já embutido pelo Vite). Lança um `ApiError`
 * controlado quando a configuração é inválida — os chamadores renderizam um
 * erro seguro no lugar do aplicativo.
 */
export function createApiClient(): ApiClient {
  const config = resolveApiClientConfig(
    { VITE_API_BASE_URL: import.meta.env.VITE_API_BASE_URL },
    { isProduction: import.meta.env.PROD },
  );
  const client = new ApiClient(config);
  instance = client;
  return client;
}

export function getApiClient(): ApiClient {
  if (instance === undefined) {
    throw ApiError.config('O cliente de API não foi inicializado.');
  }
  return instance;
}
