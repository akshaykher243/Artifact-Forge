import { access, constants, mkdir } from 'node:fs/promises';
import { createServer } from 'node:net';
import { join } from 'node:path';

import { ROOT_ENV, resolveRoot } from '../config.ts';
import type { StartupSettings } from '../config.ts';
import { StartupError } from '../errors.ts';
import { createGhClient } from '../gh/gh-client.ts';
import { readGhStatus } from '../gh/pull-requests.ts';
import { checkGithubSsh, readGitVersion } from '../git/prerequisites.ts';
import type { GithubSshState } from '../git/prerequisites.ts';
import { LOOPBACK_HOST } from '../listen.ts';
import type { RunProcess } from '../security/run-process.ts';

/** `fail` stops the app from starting; `warn` only turns off pull request review. */
export type CheckStatus = 'ok' | 'warn' | 'fail';

export interface Check {
  name: string;
  status: CheckStatus;
  detail: string;
  /** What to do about it, when it is not ok. */
  fix: string | null;
}

export const MIN_NODE_MAJOR = 22;

const ok = (name: string, detail: string): Check => ({ name, status: 'ok', detail, fix: null });

export const checkNode = (version: string): Check => {
  const major = Number(version.split('.')[0]);
  return major >= MIN_NODE_MAJOR
    ? ok('Node.js', version)
    : {
        name: 'Node.js',
        status: 'fail',
        detail: `${version} is too old`,
        fix: `Install Node.js ${MIN_NODE_MAJOR} or newer.`,
      };
};

export const checkGit = async (
  runProcess: RunProcess,
  git: string | null,
  cwd: string,
): Promise<Check> =>
  git === null
    ? { name: 'Git', status: 'fail', detail: 'not found on PATH', fix: 'Install Git.' }
    : ok('Git', await readGitVersion(runProcess, git, cwd));

export const checkClientBuild = async (buildDir: string): Promise<Check> => {
  try {
    await access(join(buildDir, 'index.html'));
    return ok('Built UI', buildDir);
  } catch {
    return { name: 'Built UI', status: 'fail', detail: 'not built yet', fix: 'Run: pnpm build' };
  }
};

export const checkRoots = async (settings: StartupSettings): Promise<Check> => {
  try {
    const roots = await Promise.all(settings.rootPaths.map(resolveRoot));
    const onlyHome = roots.length === 1 && settings.rootPaths[0] === settings.homeDir;
    return {
      name: 'Repository folders',
      status: 'ok',
      detail: roots.join(', '),
      fix: onlyHome
        ? `Optional: set ${ROOT_ENV} (or pass --root) to the folder holding your clones, so pull request links find them faster.`
        : null,
    };
  } catch (error) {
    const message = error instanceof StartupError ? error.message : String(error);
    return {
      name: 'Repository folders',
      status: 'fail',
      detail: message,
      fix: `Pass --root <folder> or set ${ROOT_ENV} to an existing folder.`,
    };
  }
};

export const checkDataDir = async (dataDir: string): Promise<Check> => {
  try {
    await mkdir(dataDir, { recursive: true, mode: 0o700 });
    await access(dataDir, constants.W_OK);
    return ok('Data folder', dataDir);
  } catch {
    return {
      name: 'Data folder',
      status: 'fail',
      detail: `${dataDir} cannot be written`,
      fix: 'Pass --data-dir <folder you can write to>.',
    };
  }
};

/** Whether the port is free on 127.0.0.1; the check binds it for a moment and lets it go. */
export const checkPort = (port: number): Promise<Check> =>
  new Promise((resolve) => {
    const server = createServer();
    server.once('error', () =>
      resolve({
        name: 'Port',
        status: 'fail',
        detail: `${port} is in use (is ArtifactForge already running?)`,
        fix: 'Stop the other program or pass --port <number>.',
      }),
    );
    server.listen(port, LOOPBACK_HOST, () => {
      server.close(() => resolve(ok('Port', `${LOOPBACK_HOST}:${port} is free`)));
    });
  });

const GITHUB_SSH: Record<GithubSshState, Omit<Check, 'name'>> = {
  authenticated: { status: 'ok', detail: 'your key is accepted', fix: null },
  unknownHost: {
    status: 'warn',
    detail: 'github.com is not in known_hosts',
    fix: 'Run once and confirm the fingerprint: ssh -T git@github.com',
  },
  denied: {
    status: 'warn',
    detail: 'GitHub refused the key',
    fix: 'Add your public key to GitHub (Settings → SSH keys) and load it: ssh-add',
  },
  unreachable: {
    status: 'warn',
    detail: 'could not reach github.com over SSH',
    fix: 'Check the network, VPN or firewall for port 22.',
  },
};

export const checkGithubOverSsh = async (
  runProcess: RunProcess,
  ssh: string | null,
  cwd: string,
): Promise<Check> => {
  const name = 'GitHub over SSH';
  if (ssh === null) {
    return { name, status: 'warn', detail: 'ssh not found', fix: 'Install OpenSSH.' };
  }
  const state = await checkGithubSsh(runProcess, ssh, cwd);
  return { name, ...GITHUB_SSH[state] };
};

export const checkGh = async (
  runProcess: RunProcess,
  gh: string | null,
  cwd: string,
): Promise<Check> => {
  const name = 'GitHub CLI';
  const fix = 'Reading pull requests and posting reviews need it. Install gh, then: gh auth login';
  if (gh === null) {
    return { name, status: 'warn', detail: 'gh not found on PATH', fix };
  }
  try {
    const status = await readGhStatus(createGhClient(runProcess, gh, cwd));
    return status.signedIn
      ? ok(name, `signed in as ${status.login ?? 'unknown'}`)
      : { name, status: 'warn', detail: 'not signed in to github.com', fix: 'Run: gh auth login' };
  } catch {
    return { name, status: 'warn', detail: 'gh auth status failed', fix: 'Run: gh auth status' };
  }
};
