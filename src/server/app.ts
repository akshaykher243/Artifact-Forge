import Fastify from 'fastify';
import type { FastifyBaseLogger, FastifyError, FastifyInstance } from 'fastify';

import { ErrorCode } from '../shared/envelope.ts';
import type { Envelope } from '../shared/envelope.ts';
import { AppError } from './errors.ts';
import { GhError } from './gh/gh-client.ts';
import { GitError } from './git/git-client.ts';
import { ProcessFailure } from './security/run-process.ts';
import type { OperationHandlers } from './routes/operations.ts';
import { registerOperations } from './routes/operations.ts';
import { securityHeaders } from './security/headers.ts';
import { createRequestGuard } from './security/request-guard.ts';

export interface AppOptions {
  logger: FastifyBaseLogger;
  port: number;
  token: string;
  contentSecurityPolicy: string;
  handlers: OperationHandlers;
}

const failure = (code: ErrorCode, message: string): Envelope<never> => ({
  success: false,
  error: { code, message },
});

const isClientError = (error: FastifyError): boolean =>
  error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500;

export const buildApp = async (options: AppOptions): Promise<FastifyInstance> => {
  const app = Fastify({ loggerInstance: options.logger });
  const headers = securityHeaders(options.contentSecurityPolicy);

  app.addHook('onRequest', createRequestGuard(options));
  app.addHook('onSend', async (_request, reply) => {
    reply.headers(headers);
  });

  app.setErrorHandler<FastifyError>(async (error, request, reply) => {
    if (error instanceof AppError) {
      return reply.status(error.status).send(failure(error.code, error.message));
    }
    if (error instanceof GitError) {
      return reply.status(502).send(failure(ErrorCode.gitFailed, error.message));
    }
    if (error instanceof GhError) {
      return reply.status(502).send(failure(ErrorCode.ghFailed, error.message));
    }
    if (error instanceof ProcessFailure) {
      const code = error.kind === 'timeout' ? ErrorCode.timeout : ErrorCode.internal;
      return reply.status(504).send(failure(code, error.message));
    }
    if (error.statusCode === 415) {
      return reply
        .status(415)
        .send(failure(ErrorCode.unsupportedMediaType, 'Requests must be JSON'));
    }
    if (isClientError(error) && !request.url.startsWith('/api/')) {
      // A malformed asset path is reported the same way as a missing one.
      return reply.status(404).send(failure(ErrorCode.notFound, 'Not found'));
    }
    if (isClientError(error)) {
      return reply.status(400).send(failure(ErrorCode.invalidInput, 'Invalid request'));
    }
    request.log.error({ err: error, url: request.url }, 'Unhandled error');
    return reply.status(500).send(failure(ErrorCode.internal, 'Something went wrong'));
  });

  app.setNotFoundHandler(async (_request, reply) =>
    reply.status(404).send(failure(ErrorCode.notFound, 'Not found')),
  );

  registerOperations(app, options.handlers);
  return app;
};
