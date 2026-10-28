import { basename } from 'node:path';

import { ErrorCode } from '../../shared/envelope.ts';
import type { RefList, RemoteSummary } from '../../shared/repository.ts';
import { AppError } from '../errors.ts';
import type { PathRules } from '../security/validate.ts';
import { resolveRepositoryPath } from '../security/validate.ts';
import { maskSecrets } from '../security/mask-secrets.ts';
import { GitError } from './git-client.ts';
import type { GitClient } from './git-client.ts';
import { parseRemoteUrl } from './remote-url.ts';

const FIELD = '%00';
const REF_FORMAT = ['%(refname)', '%(objectname)', '%(*objectname)'].join(FIELD);

/** Resolves and confines the path, then checks it is the top level of a Git working tree. */
export const openRepository = async (
  git: GitClient,
  input: string,
  rules: PathRules,
): Promise<{ path: string; name: string }> => {
  const path = await resolveRepositoryPath(input, rules);
  const result = await git.exec(path, ['rev-parse', '--show-toplevel']);
  if (result.exitCode !== 0 || result.stdout.trim() !== path) {
    throw new AppError(ErrorCode.notARepository, 400, 'Not a Git repository');
  }
  return { path, name: basename(path) };
};

interface ParsedRef {
  ref: string;
  sha: string;
}

const parseRefs = (output: string): ParsedRef[] =>
  output
    .split('\n')
    .filter((line) => line !== '')
    .map((line) => {
      const [ref = '', object = '', peeled = ''] = line.split('\0');
      return { ref, sha: peeled || object };
    });

const named = (refs: ParsedRef[], prefix: string) =>
  refs
    .filter(({ ref }) => ref.startsWith(prefix) && !ref.endsWith('/HEAD'))
    .map(({ ref, sha }) => ({ name: ref.slice(prefix.length), sha }));

const REMOTE_URL_KEY = /^remote\.(.+)\.url$/;

/**
 * Remotes with their configured URL (not the `insteadOf`-rewritten one), so the SSH check
 * applies to what the user configured. Sorted by name.
 */
export const listRemotes = async (git: GitClient, path: string): Promise<RemoteSummary[]> => {
  const result = await git.exec(path, ['config', '--get-regexp', '^remote\\..*\\.url$']);
  // Exit code 1 means no remote is configured.
  if (result.exitCode !== 0 && result.exitCode !== 1) {
    throw new GitError(result.exitCode, maskSecrets(result.stderr));
  }
  const remotes = new Map<string, RemoteSummary>();
  for (const line of result.stdout.split('\n')) {
    const [key = '', url = ''] = line.split(' ');
    const name = REMOTE_URL_KEY.exec(key)?.[1];
    if (name !== undefined && url !== '' && !remotes.has(name)) {
      remotes.set(name, { name, url, ...parseRemoteUrl(url) });
    }
  }
  return [...remotes.values()].sort((a, b) => a.name.localeCompare(b.name));
};

const currentBranch = async (git: GitClient, path: string): Promise<string | null> => {
  const result = await git.exec(path, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  return result.exitCode === 0 ? result.stdout.trim() : null;
};

export const listRefs = async (git: GitClient, path: string): Promise<RefList> => {
  const [refOutput, remotes, head] = await Promise.all([
    git.run(path, [
      'for-each-ref',
      `--format=${REF_FORMAT}`,
      'refs/heads',
      'refs/remotes',
      'refs/tags',
    ]),
    listRemotes(git, path),
    currentBranch(git, path),
  ]);
  const refs = parseRefs(refOutput);
  return {
    head,
    branches: named(refs, 'refs/heads/'),
    remoteBranches: named(refs, 'refs/remotes/'),
    tags: named(refs, 'refs/tags/'),
    remotes,
  };
};
