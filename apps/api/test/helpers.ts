import http from 'node:http';
import type { IncomingHttpHeaders } from 'node:http';

export interface HttpResponse {
  status: number;
  headers: IncomingHttpHeaders;
  text: string;
}

export function httpRequest(
  baseUrl: string,
  method: string,
  path: string,
  options: { headers?: Record<string, string>; body?: string | Buffer } = {},
): Promise<HttpResponse> {
  return new Promise((resolve, reject) => {
    const url = new URL(path, baseUrl);
    const request = http.request(
      {
        hostname: url.hostname,
        port: url.port,
        path: `${url.pathname}${url.search}`,
        method,
        headers: options.headers,
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => {
          chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
        });
        response.on('end', () => {
          resolve({
            status: response.statusCode ?? 0,
            headers: response.headers,
            text: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    request.on('error', reject);
    if (options.body !== undefined) {
      request.write(options.body);
    }
    request.end();
  });
}
