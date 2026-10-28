import type { FastifyRequest } from 'fastify';

import { forbidden } from '../errors.ts';
import { tokensMatch } from './token.ts';

export const TOKEN_HEADER = 'x-af-token';

export interface GuardOptions {
  port: number;
  token: string;
}

const headerValue = (request: FastifyRequest, name: string): string | undefined => {
  const value = request.headers[name];
  return Array.isArray(value) ? undefined : value;
};

/**
 * Host pinning defeats DNS rebinding, the Origin check stops other sites' pages, and the
 * token (sent only as a header, which a cross-site form cannot set) gates every operation.
 */
export const createRequestGuard = ({ port, token }: GuardOptions) => {
  const hosts = new Set([`127.0.0.1:${port}`, `localhost:${port}`]);
  const origins = new Set([...hosts].map((host) => `http://${host}`));

  return async (request: FastifyRequest): Promise<void> => {
    if (!hosts.has(headerValue(request, 'host') ?? '')) {
      throw forbidden();
    }
    const origin = headerValue(request, 'origin');
    if (origin !== undefined && !origins.has(origin)) {
      throw forbidden();
    }
    if (
      request.url.startsWith('/api/') &&
      !tokensMatch(token, headerValue(request, TOKEN_HEADER))
    ) {
      throw forbidden();
    }
  };
};
