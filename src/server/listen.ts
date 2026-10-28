import type { FastifyInstance } from 'fastify';

import { StartupError } from './errors.ts';

export const LOOPBACK_HOST = '127.0.0.1';

const isAddressInUse = (error: unknown): boolean =>
  error instanceof Error && 'code' in error && error.code === 'EADDRINUSE';

export const listenOnLoopback = async (app: FastifyInstance, port: number): Promise<void> => {
  try {
    await app.listen({ host: LOOPBACK_HOST, port });
  } catch (error) {
    if (isAddressInUse(error)) {
      throw new StartupError(
        `Port ${port} is already in use. Pass --port <number> to use another.`,
      );
    }
    throw error;
  }
};
