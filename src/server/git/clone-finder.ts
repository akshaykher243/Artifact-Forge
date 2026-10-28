import { access, readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';

import type { FoundClone } from '../../shared/repository.ts';
import type { PathRules } from '../security/validate.ts';
import { isInsideRoot } from '../security/validate.ts';
import type { GitClient } from './git-client.ts';
import type { GitHubRepo } from './remote-url.ts';
import { listRemotes } from './repository.ts';

/** Bounds on the scan, so a large root never turns one link into minutes of disk walking. */
const MAX_DEPTH = 4;
const MAX_FOLDERS = 2_000;
const CONCURRENCY = 4;
const SKIPPED = new Set(['node_modules', 'dist', 'build']);

const isRepository = async (folder: string): Promise<boolean> => {
  try {
    await access(join(folder, '.git'));
    return true;
  } catch {
    return false;
  }
};

const subfolders = async (folder: string): Promise<string[]> => {
  try {
    const entries = await readdir(folder, { withFileTypes: true });
    return entries
      .filter(
        (entry) => entry.isDirectory() && !entry.name.startsWith('.') && !SKIPPED.has(entry.name),
      )
      .map((entry) => join(folder, entry.name));
  } catch {
    return [];
  }
};

/** Folders inside the roots that hold a `.git`, breadth-first, listing names only. */
export const findRepositories = async (roots: readonly string[]): Promise<string[]> => {
  const found: string[] = [];
  let level = [...roots];
  let visited = 0;
  for (let depth = 0; depth <= MAX_DEPTH && level.length > 0 && visited < MAX_FOLDERS; depth++) {
    const next: string[] = [];
    for (const folder of level) {
      if (visited >= MAX_FOLDERS) {
        break;
      }
      visited++;
      if (await isRepository(folder)) {
        found.push(folder);
      }
      next.push(...(await subfolders(folder)));
    }
    level = next;
  }
  return found;
};

const sameName = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/** The remote of `repoPath` that points at the GitHub repository, SSH first. */
const matchingRemote = async (
  git: GitClient,
  repoPath: string,
  repo: GitHubRepo,
): Promise<string | null> => {
  try {
    const matches = (await listRemotes(git, repoPath)).filter(
      (remote) =>
        remote.github !== null &&
        sameName(remote.github.owner, repo.owner) &&
        sameName(remote.github.name, repo.name),
    );
    return (matches.find((remote) => remote.ssh) ?? matches[0])?.name ?? null;
  } catch {
    return null;
  }
};

const inBatches = async <T, R>(
  items: readonly T[],
  size: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = [];
  for (let start = 0; start < items.length; start += size) {
    results.push(...(await Promise.all(items.slice(start, start + size).map(task))));
  }
  return results;
};

/**
 * Local clones of a GitHub repository: recently opened repositories first,
 * then repositories found inside the roots. Only paths inside the roots are considered.
 */
export const findClones = async (
  git: GitClient,
  repo: GitHubRepo,
  rules: PathRules,
  recentPaths: readonly string[],
): Promise<FoundClone[]> => {
  const insideRoots = (path: string): boolean =>
    rules.roots.some((root) => isInsideRoot(path, root));
  const candidates = [
    ...new Set([...recentPaths.filter(insideRoots), ...(await findRepositories(rules.roots))]),
  ];
  const remotes = await inBatches(candidates, CONCURRENCY, (path) =>
    matchingRemote(git, path, repo),
  );
  return candidates.flatMap((path, index) => {
    const remote = remotes[index];
    return remote === null || remote === undefined ? [] : [{ path, name: basename(path), remote }];
  });
};
