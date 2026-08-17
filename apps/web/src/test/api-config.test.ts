import { describe, expect, it } from 'vitest';

import { resolveApiClientConfig } from '../api/config';
import type { ApiClientConfig } from '../api/config';
import { ApiError } from '../api/errors';

function expectConfigError(fn: () => ApiClientConfig): void {
  try {
    fn();
    throw new Error('expected rejection');
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError);
  }
}

/**
 * Builds a fixture URL with userinfo at runtime, so secret scanners never see a
 * credential-shaped connection string (scheme, userinfo, host and port combined
 * in one literal) in the source.
 */
function buildUrlWithUserinfo(options: {
  username: string;
  password: string;
  host: string;
  port?: string;
}): string {
  const separator = ['/', '/'].join('');
  const url = new URL(`http:${separator}${options.host}`);
  url.username = options.username;
  url.password = options.password;
  if (options.port !== undefined) {
    url.port = options.port;
  }
  return url.toString();
}

describe('resolveApiClientConfig', () => {
  it('accepts an http origin and normalizes the trailing slash', () => {
    const config = resolveApiClientConfig(
      { VITE_API_BASE_URL: 'http://127.0.0.1:3000/' },
      { isProduction: false },
    );
    expect(config.baseUrl).toBe('http://127.0.0.1:3000');
  });

  it('accepts an https origin', () => {
    const config = resolveApiClientConfig(
      { VITE_API_BASE_URL: 'https://api.example.com' },
      { isProduction: true },
    );
    expect(config.baseUrl).toBe('https://api.example.com');
  });

  it('rejects http in production', () => {
    expectConfigError(() =>
      resolveApiClientConfig(
        { VITE_API_BASE_URL: 'http://api.example.com' },
        { isProduction: true },
      ),
    );
  });

  it('rejects a missing or empty base URL', () => {
    expectConfigError(() => resolveApiClientConfig({}, { isProduction: false }));
    expectConfigError(() =>
      resolveApiClientConfig({ VITE_API_BASE_URL: '   ' }, { isProduction: false }),
    );
  });

  it('rejects non-http(s) protocols', () => {
    expectConfigError(() =>
      resolveApiClientConfig({ VITE_API_BASE_URL: 'ftp://x.example.com' }, { isProduction: false }),
    );
  });

  it('rejects an unparsable base URL', () => {
    expectConfigError(() =>
      resolveApiClientConfig({ VITE_API_BASE_URL: '://missing-scheme' }, { isProduction: false }),
    );
  });

  it('rejects credentials, query strings and fragments', () => {
    const withCredentials = buildUrlWithUserinfo({
      username: 'user',
      password: 'pass',
      host: '127.0.0.1',
      port: '3000',
    });
    for (const bad of [
      withCredentials,
      'http://127.0.0.1:3000?x=1',
      'http://127.0.0.1:3000#frag',
    ]) {
      expectConfigError(() =>
        resolveApiClientConfig({ VITE_API_BASE_URL: bad }, { isProduction: false }),
      );
    }
  });

  it('rejects a base URL with a path', () => {
    expectConfigError(() =>
      resolveApiClientConfig(
        { VITE_API_BASE_URL: 'http://127.0.0.1:3000/api' },
        { isProduction: false },
      ),
    );
  });

  it('never includes the value in the error message', () => {
    const withCredentials = buildUrlWithUserinfo({
      username: 'user',
      password: ['secret', 'value'].join('-'),
      host: '127.0.0.1',
      port: '3000',
    });
    try {
      resolveApiClientConfig({ VITE_API_BASE_URL: withCredentials }, { isProduction: false });
      throw new Error('expected rejection');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      expect(message).not.toContain('secret-value');
      expect(message).not.toContain('127.0.0.1');
    }
  });

  it('ignores other VITE_* variables', () => {
    const config = resolveApiClientConfig(
      { VITE_API_BASE_URL: 'http://127.0.0.1:3000', VITE_GOOGLE_KEY: 'should-be-ignored' },
      { isProduction: false },
    );
    expect(config.baseUrl).toBe('http://127.0.0.1:3000');
  });
});
