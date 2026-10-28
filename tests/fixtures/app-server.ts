import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FAKE_GH_BIN_DIR } from './fake-gh.ts';

const PROJECT_ROOT = join(import.meta.dirname, '..', '..');
const TSX = join(PROJECT_ROOT, 'node_modules', '.bin', 'tsx');
const STARTUP_TIMEOUT_MS = 15_000;

export interface RunningApp {
  /** Origin without the token, e.g. http://127.0.0.1:41234 */
  origin: string;
  /** The exact address the app printed, including `#token=`. */
  startUrl: string;
  root: string;
  dataDir: string;
  /** HOME of the app's child processes; write the fake gh's scenario under it. */
  ghHome: string;
  stop: () => Promise<void>;
}

const findFreePort = async (): Promise<number> => {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  await new Promise<void>((resolve) => server.close(() => resolve()));
  if (address === null || typeof address === 'string') {
    throw new Error('Could not allocate a free port');
  }
  return address.port;
};

const waitForStartUrl = (child: ChildProcess): Promise<string> =>
  new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(
      () => reject(new Error(`App did not start within ${STARTUP_TIMEOUT_MS} ms:\n${output}`)),
      STARTUP_TIMEOUT_MS,
    );
    const onData = (chunk: Buffer): void => {
      output += chunk.toString();
      const match = /running at (http:\/\/\S+)/.exec(output);
      if (match?.[1] !== undefined) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    };
    child.stdout?.on('data', onData);
    child.stderr?.on('data', onData);
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`App exited with code ${code} before starting:\n${output}`));
    });
  });

export interface StartOptions {
  fixture: 'small' | 'large' | null;
  /** Reuse a root or data folder (e.g. to simulate a restart); the caller then removes it. */
  root?: string;
  dataDir?: string;
}

const temporaryDir = async (prefix: string): Promise<string> =>
  realpath(await mkdtemp(join(tmpdir(), prefix)));

/**
 * Starts the built app (production mode) on a free loopback port, with an empty temporary root
 * and its own data folder unless given, so tests never touch the real ones.
 */
export const startApp = async (options: StartOptions): Promise<RunningApp> => {
  const root = options.root ?? (await temporaryDir('af-e2e-root-'));
  const dataDir = options.dataDir ?? (await temporaryDir('af-e2e-data-'));
  const ghHome = await temporaryDir('af-e2e-home-');
  const port = await findFreePort();
  const args = [
    'src/server/index.ts',
    ...['--root', root, '--data-dir', dataDir, '--port', String(port)],
  ];
  const child = spawn(
    TSX,
    options.fixture === null ? args : [...args, '--fixture', options.fixture],
    {
      cwd: PROJECT_ROOT,
      // The fake gh comes first on PATH so no test can reach a real GitHub login.
      env: { ...process.env, PATH: `${FAKE_GH_BIN_DIR}:${process.env.PATH ?? ''}`, HOME: ghHome },
      stdio: ['ignore', 'pipe', 'pipe'],
    },
  );
  const startUrl = await waitForStartUrl(child);
  return {
    origin: `http://127.0.0.1:${port}`,
    startUrl,
    root,
    dataDir,
    ghHome,
    stop: async () => {
      const exited = new Promise<void>((resolve) => child.once('exit', () => resolve()));
      child.kill('SIGTERM');
      await exited;
      await rm(ghHome, { recursive: true, force: true });
      if (options.root === undefined) {
        await rm(root, { recursive: true, force: true });
      }
      if (options.dataDir === undefined) {
        await rm(dataDir, { recursive: true, force: true });
      }
    },
  };
};
