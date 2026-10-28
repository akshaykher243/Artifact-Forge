import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import type { Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { attachStaticClient } from '../../../src/server/client.ts';
import { StartupError } from '../../../src/server/errors.ts';
import { listenOnLoopback } from '../../../src/server/listen.ts';
import { buildTestApp, TEST_HOST } from '../../fixtures/test-app.ts';

const occupyPort = async (): Promise<{ server: Server; port: number }> => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (address === null || typeof address === 'string') {
    throw new Error('Expected a TCP address');
  }
  return { server, port: address.port };
};

describe('start-up', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    app = await buildTestApp();
  });

  afterEach(async () => {
    await app.close();
  });

  it('reports a port already in use instead of crashing', async () => {
    const { server, port } = await occupyPort();
    try {
      await expect(listenOnLoopback(app, port)).rejects.toThrow(
        new StartupError(`Port ${port} is already in use. Pass --port <number> to use another.`),
      );
    } finally {
      server.close();
    }
  });

  it('fails fast when the client build is missing', async () => {
    await expect(attachStaticClient(app, '/nonexistent-af-build')).rejects.toThrow(
      'Client build not found',
    );
  });
});

describe('static assets (No arbitrary file access)', () => {
  let app: FastifyInstance;
  let root: string;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'af-static-'));
    await writeFile(join(root, 'index.html'), '<!doctype html><title>ok</title>');
    app = await buildTestApp();
    await attachStaticClient(app, root);
  });

  afterEach(async () => {
    await app.close();
    await rm(root, { recursive: true, force: true });
  });

  it('serves the UI without a token', async () => {
    const response = await app.inject({ url: '/', headers: { host: TEST_HOST } });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain('<title>ok</title>');
  });

  it.each(['/../package.json', '/%2e%2e/package.json', '/..%2fpackage.json', '/.env'])(
    'Asset path escape: returns not found for %s',
    async (url) => {
      const response = await app.inject({ url, headers: { host: TEST_HOST } });

      expect(response.statusCode).toBe(404);
    },
  );

  it('still pins the Host header for page loads', async () => {
    const response = await app.inject({ url: '/', headers: { host: 'evil.example' } });

    expect(response.statusCode).toBe(403);
  });
});
