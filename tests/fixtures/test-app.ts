import { mkdtemp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import { pino } from 'pino';

import { buildApp } from '../../src/server/app.ts';
import { loadConfig } from '../../src/server/config.ts';
import { createDependencies } from '../../src/server/dependencies.ts';
import type { FixtureName } from '../../src/server/fixtures/fixture-source.ts';
import { createHandlers } from '../../src/server/routes/handlers.ts';
import { PRODUCTION_CSP } from '../../src/server/security/headers.ts';
import { FAKE_GH_BIN_DIR } from './fake-gh.ts';

export const TEST_PORT = 4399;
export const TEST_TOKEN = 'test-token-0123456789abcdefghijklmnopqrstuv';
export const TEST_HOST = `127.0.0.1:${TEST_PORT}`;
export const TEST_ORIGIN = `http://${TEST_HOST}`;

export interface TestAppOptions {
  fixture?: FixtureName;
  /** Folder repositories must live in; defaults to the system temporary folder. */
  root?: string;
  /** App data folder; defaults to a fresh temporary folder. */
  dataDir?: string;
  /** HOME for the app's child processes; the fake gh reads its scenario from here. */
  ghHome?: string;
  /** Replaces PATH entirely, e.g. to leave gh out; the fake gh is not added. */
  path?: string;
}

/** The real app wiring (config, runner, Git, store) with a fixed token and silent logs. */
export const buildTestApp = async (options: TestAppOptions = {}): Promise<FastifyInstance> => {
  const root = options.root ?? (await realpath(tmpdir()));
  const dataDir = options.dataDir ?? (await mkdtemp(join(tmpdir(), 'af-data-')));
  const flags = ['--root', root, '--data-dir', dataDir];
  // The fake gh always comes first on PATH, so a test can never reach a real GitHub login.
  const env = {
    ...process.env,
    PATH: options.path ?? `${FAKE_GH_BIN_DIR}:${process.env.PATH ?? ''}`,
    HOME: options.ghHome ?? (await mkdtemp(join(tmpdir(), 'af-home-'))),
  };
  const config = await loadConfig(
    options.fixture ? [...flags, '--fixture', options.fixture] : flags,
    env,
  );
  const logger = pino({ level: 'silent' });
  return buildApp({
    logger,
    port: TEST_PORT,
    token: TEST_TOKEN,
    contentSecurityPolicy: PRODUCTION_CSP,
    handlers: createHandlers(await createDependencies(config, logger)),
  });
};

const withoutUndefined = (headers: Record<string, unknown>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(headers).filter((entry): entry is [string, string] => entry[1] !== undefined),
  );

/**
 * A well-formed operation call; each test overrides only the part it is about.
 * A header overridden with `undefined` is left out of the request.
 */
export const callOp = (
  app: FastifyInstance,
  name: string,
  overrides: Partial<InjectOptions> = {},
): Promise<LightMyRequestResponse> =>
  app.inject({
    method: 'POST',
    url: `/api/op/${name}`,
    payload: {},
    ...overrides,
    headers: withoutUndefined({
      host: TEST_HOST,
      origin: TEST_ORIGIN,
      'content-type': 'application/json',
      'x-af-token': TEST_TOKEN,
      ...overrides.headers,
    }),
  });
