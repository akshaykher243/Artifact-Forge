import type { FastifyInstance, FastifyRequest } from 'fastify';

import { ErrorCode } from '../../shared/envelope.ts';
import type { Envelope } from '../../shared/envelope.ts';
import {
  isOperationName,
  operations,
  type OperationInput,
  type OperationName,
  type OperationOutput,
} from '../../shared/operations.ts';
import { AppError } from '../errors.ts';

export type OperationHandlers = {
  [N in OperationName]: (input: OperationInput<N>) => Promise<OperationOutput<N>>;
};

const requireJson = async (request: FastifyRequest): Promise<void> => {
  const contentType = request.headers['content-type'] ?? '';
  if (!contentType.toLowerCase().startsWith('application/json')) {
    throw new AppError(ErrorCode.unsupportedMediaType, 415, 'Requests must be JSON');
  }
};

export const registerOperations = (app: FastifyInstance, handlers: OperationHandlers): void => {
  app.post<{ Params: { name: string } }>(
    '/api/op/:name',
    { preValidation: requireJson },
    async (request): Promise<Envelope<unknown>> => {
      const { name } = request.params;
      if (!isOperationName(name)) {
        throw new AppError(ErrorCode.notFound, 404, 'Unknown operation');
      }
      const parsed = operations[name].input.safeParse(request.body ?? {});
      if (!parsed.success) {
        throw new AppError(ErrorCode.invalidInput, 400, 'Invalid input');
      }
      // The mapped type guarantees each handler matches its own schema; TypeScript cannot
      // correlate the union of names with the union of handlers, so the call is widened here.
      const handler = handlers[name] as (input: unknown) => Promise<unknown>;
      return { success: true, data: await handler(parsed.data) };
    },
  );
};
