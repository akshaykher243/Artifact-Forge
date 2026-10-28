import { access } from 'node:fs/promises';
import { join } from 'node:path';

import fastifyMiddie from '@fastify/middie';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance } from 'fastify';

import { StartupError } from './errors.ts';

export const CLIENT_BUILD_DIR = join(import.meta.dirname, '..', '..', 'dist', 'client');
const PROJECT_ROOT = join(import.meta.dirname, '..', '..');

/** Serves the built UI; the static plugin confines every path to `root`. */
export const attachStaticClient = async (app: FastifyInstance, root: string): Promise<void> => {
  try {
    await access(join(root, 'index.html'));
  } catch {
    throw new StartupError(`Client build not found in ${root}. Run "pnpm build" first.`);
  }
  await app.register(fastifyStatic, { root, index: 'index.html', dotfiles: 'ignore' });
};

/** Mounts Vite on the same server so development keeps one origin and the same request guard. */
export const attachDevClient = async (app: FastifyInstance): Promise<void> => {
  const { createServer } = await import('vite');
  const vite = await createServer({
    configFile: join(PROJECT_ROOT, 'vite.config.ts'),
    appType: 'spa',
    server: { middlewareMode: true, hmr: { server: app.server } },
  });
  await app.register(fastifyMiddie);
  app.use(vite.middlewares);
  app.addHook('onClose', async () => {
    await vite.close();
  });
};
