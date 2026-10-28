import { access, constants, realpath, stat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';
import { parseArgs } from 'node:util';

import { StartupError } from './errors.ts';
import { FIXTURE_NAMES } from './fixtures/fixture-source.ts';
import type { FixtureName } from './fixtures/fixture-source.ts';

export interface Binaries {
  git: string;
  /** Absent when the GitHub CLI is not installed; review and drafts still work without it. */
  gh: string | null;
}

export interface AppConfig {
  roots: string[];
  port: number;
  dev: boolean;
  fixture: FixtureName | null;
  dataDir: string;
  homeDir: string;
  binaries: Binaries;
  /** The only parent variables child processes inherit; everything else (GIT_*, GH_*, ...) is dropped. */
  childEnv: Record<string, string>;
}

/** Folders to open repositories from, separated like PATH; `--root` takes precedence. */
export const ROOT_ENV = 'ARTIFACTFORGE_ROOT';
const DEFAULT_PORT = 4317;
const INHERITED_ENV = ['PATH', 'HOME', 'USER', 'LANG', 'SSH_AUTH_SOCK', 'TMPDIR'] as const;

/** The per-user application data folder each platform expects. */
export const defaultDataDir = (
  platform: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
  home: string,
): string => {
  if (platform === 'darwin') {
    return join(home, 'Library', 'Application Support', 'ArtifactForge');
  }
  if (platform === 'win32') {
    return join(env.APPDATA ?? join(home, 'AppData', 'Roaming'), 'ArtifactForge');
  }
  return join(env.XDG_DATA_HOME ?? join(home, '.local', 'share'), 'artifactforge');
};

/** `--root` flags, else the folders in ARTIFACTFORGE_ROOT, else the home folder. */
export const rootPathsFrom = (
  flagRoots: readonly string[] | undefined,
  env: NodeJS.ProcessEnv,
  home: string,
): string[] => {
  if (flagRoots !== undefined) {
    return [...flagRoots];
  }
  const fromEnv = (env[ROOT_ENV] ?? '').split(delimiter).filter((path) => path !== '');
  return fromEnv.length > 0 ? fromEnv : [home];
};

const parsePort = (value: string): number => {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new StartupError(`--port must be a whole number from 1024 to 65535, got "${value}"`);
  }
  return port;
};

const parseFixture = (value: string): FixtureName => {
  const name = FIXTURE_NAMES.find((candidate) => candidate === value);
  if (name === undefined) {
    throw new StartupError(`--fixture must be one of ${FIXTURE_NAMES.join(', ')}, got "${value}"`);
  }
  return name;
};

export const resolveRoot = async (path: string): Promise<string> => {
  requireAbsolute('--root', path);
  try {
    const resolved = await realpath(path);
    if (!(await stat(resolved)).isDirectory()) {
      throw new StartupError(`Root is not a folder: ${path}`);
    }
    return resolved;
  } catch (error) {
    if (error instanceof StartupError) {
      throw error;
    }
    throw new StartupError(`Root folder not found: ${path}`);
  }
};

const requireAbsolute = (flag: string, path: string): string => {
  if (!isAbsolute(path)) {
    throw new StartupError(`${flag} must be an absolute path, got "${path}"`);
  }
  return path;
};

const isExecutable = async (path: string): Promise<boolean> => {
  try {
    await access(path, constants.X_OK);
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
};

/** Looks the binary up on PATH once, at start-up, so later calls never depend on PATH again. */
export const findBinary = async (name: string, searchPath: string): Promise<string | null> => {
  for (const dir of searchPath.split(delimiter).filter((entry) => isAbsolute(entry))) {
    const candidate = join(dir, name);
    if (await isExecutable(candidate)) {
      return realpath(candidate);
    }
  }
  return null;
};

const resolveBinaries = async (searchPath: string): Promise<Binaries> => {
  const git = await findBinary('git', searchPath);
  if (git === null) {
    throw new StartupError('git was not found on PATH. Install Git and try again.');
  }
  return { git, gh: await findBinary('gh', searchPath) };
};

const pickChildEnv = (env: NodeJS.ProcessEnv): Record<string, string> =>
  Object.fromEntries(
    INHERITED_ENV.flatMap((name) => (env[name] === undefined ? [] : [[name, env[name]]])),
  );

const parseFlags = (argv: string[]) =>
  parseArgs({
    args: argv,
    strict: true,
    options: {
      root: { type: 'string', multiple: true },
      port: { type: 'string' },
      dev: { type: 'boolean' },
      fixture: { type: 'string' },
      'data-dir': { type: 'string' },
    },
  }).values;

const readFlags = (argv: string[]): ReturnType<typeof parseFlags> => {
  try {
    return parseFlags(argv);
  } catch (error) {
    throw new StartupError(error instanceof Error ? error.message : 'Invalid command-line flags');
  }
};

/** What the flags and environment ask for, before anything on disk is checked. */
export interface StartupSettings {
  rootPaths: string[];
  port: number;
  dev: boolean;
  fixture: FixtureName | null;
  dataDir: string;
  homeDir: string;
  searchPath: string;
  childEnv: Record<string, string>;
}

export const readSettings = (
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): StartupSettings => {
  const flags = readFlags(argv);
  const home = homedir();
  const dataDir = flags['data-dir'];
  return {
    rootPaths: rootPathsFrom(flags.root, env, home),
    port: flags.port === undefined ? DEFAULT_PORT : parsePort(flags.port),
    dev: flags.dev ?? false,
    fixture: flags.fixture === undefined ? null : parseFixture(flags.fixture),
    dataDir:
      dataDir === undefined
        ? defaultDataDir(platform, env, home)
        : requireAbsolute('--data-dir', dataDir),
    homeDir: home,
    searchPath: env.PATH ?? '',
    childEnv: pickChildEnv(env),
  };
};

export const loadConfig = async (
  argv: string[],
  env: NodeJS.ProcessEnv = process.env,
): Promise<AppConfig> => {
  const settings = readSettings(argv, env);
  return {
    roots: await Promise.all(settings.rootPaths.map(resolveRoot)),
    port: settings.port,
    dev: settings.dev,
    fixture: settings.fixture,
    dataDir: settings.dataDir,
    homeDir: settings.homeDir,
    binaries: await resolveBinaries(settings.searchPath),
    childEnv: settings.childEnv,
  };
};
