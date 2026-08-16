import { ApiError } from './errors';

export interface ApiClientConfig {
  /** Validated API origin, e.g. `http://127.0.0.1:3000` (no path/query/credentials). */
  baseUrl: string;
}

const CONFIG_ERROR = 'Configuração inválida do cliente de API.';

/**
 * Valida `VITE_API_BASE_URL`, injetada pelo Vite durante dev/build
 * (`import.meta.env`). A validação acontece no bootstrap do frontend sobre o
 * valor já embutido pelo Vite; alterá-la exige reiniciar o dev server ou
 * reconstruir o bundle. Configuração pública (nunca segredo): http/https,
 * origem apenas, sem credentials/query/fragment (uma barra final é tolerada e
 * removida). HTTPS é obrigatório em produção. Em falha, um erro controlado é
 * lançado e o valor nunca é ecoado. Somente esta variável `VITE_*` é lida.
 */
export function resolveApiClientConfig(
  source: Record<string, string | undefined>,
  options: { isProduction: boolean },
): ApiClientConfig {
  const raw = source['VITE_API_BASE_URL'];
  if (raw === undefined || raw.trim().length === 0) {
    throw ApiError.config(CONFIG_ERROR);
  }
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw ApiError.config(CONFIG_ERROR);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw ApiError.config(CONFIG_ERROR);
  }
  if (url.username !== '' || url.password !== '') {
    throw ApiError.config(CONFIG_ERROR);
  }
  if (url.search !== '' || url.hash !== '') {
    throw ApiError.config(CONFIG_ERROR);
  }
  if (url.pathname !== '' && url.pathname !== '/') {
    throw ApiError.config(CONFIG_ERROR);
  }
  if (options.isProduction && url.protocol !== 'https:') {
    throw ApiError.config('HTTPS é obrigatório em produção.');
  }
  return { baseUrl: url.origin };
}
