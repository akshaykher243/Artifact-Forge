import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

/** Test Git runs isolated from the developer's own configuration, with a fixed identity and clock. */
const GIT_ENV: NodeJS.ProcessEnv = {
  PATH: process.env.PATH,
  HOME: tmpdir(),
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_AUTHOR_NAME: 'Test Author',
  GIT_AUTHOR_EMAIL: 'author@example.test',
  GIT_COMMITTER_NAME: 'Test Author',
  GIT_COMMITTER_EMAIL: 'author@example.test',
  GIT_AUTHOR_DATE: '2026-01-01T00:00:00Z',
  GIT_COMMITTER_DATE: '2026-01-01T00:00:00Z',
};

export type FileContents = Record<string, string | Buffer | null>;

export interface TestRepo {
  path: string;
  /** Runs git in the repository and returns trimmed stdout. */
  git: (...args: string[]) => string;
  /** Writes (or, for `null`, deletes) files, stages everything and commits; returns the new SHA. */
  commit: (message: string, files: FileContents) => Promise<string>;
  remove: () => Promise<void>;
}

export const runGit = (cwd: string, args: readonly string[]): string =>
  execFileSync('git', args, { cwd, env: GIT_ENV, encoding: 'utf8' }).trim();

const applyFiles = async (root: string, files: FileContents): Promise<void> => {
  for (const [path, contents] of Object.entries(files)) {
    const target = join(root, path);
    if (contents === null) {
      await rm(target, { force: true });
    } else {
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, contents);
    }
  }
};

/** A fresh repository on `main` inside `parent` (default: the system temporary folder). */
export const makeRepo = async (parent?: string): Promise<TestRepo> => {
  const base = parent ?? (await realpath(tmpdir()));
  const path = await realpath(await mkdtemp(join(base, 'af-repo-')));
  runGit(path, ['init', '--quiet', '--initial-branch=main']);
  return {
    path,
    git: (...args) => runGit(path, args),
    commit: async (message, files) => {
      await applyFiles(path, files);
      runGit(path, ['add', '--all']);
      runGit(path, ['commit', '--quiet', '--allow-empty', '-m', message]);
      return runGit(path, ['rev-parse', 'HEAD']);
    },
    remove: () => rm(path, { recursive: true, force: true }),
  };
};

export interface RepoSnapshot {
  refs: string;
  head: string;
  status: string;
  stashes: string;
  config: string;
}

/** Everything a review must leave untouched: refs, HEAD, working tree and index, stashes, config. */
export const snapshotRepo = async (path: string): Promise<RepoSnapshot> => ({
  refs: runGit(path, ['for-each-ref', '--format=%(refname) %(objectname)']),
  head: runGit(path, ['rev-parse', '--symbolic-full-name', 'HEAD']),
  status: runGit(path, ['status', '--porcelain=v2', '--branch', '--untracked-files=all']),
  stashes: runGit(path, ['stash', 'list']),
  config: await readFile(join(path, '.git', 'config'), 'utf8'),
});
