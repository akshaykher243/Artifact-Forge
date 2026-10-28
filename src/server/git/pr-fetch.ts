import { ErrorCode } from '../../shared/envelope.ts';
import type { RemoteSummary } from '../../shared/repository.ts';
import { AppError } from '../errors.ts';
import { maskSecrets } from '../security/mask-secrets.ts';
import type { GitClient } from './git-client.ts';
import { NETWORK_GIT_TIMEOUT_MS } from './git-client.ts';
import { validateRef } from './refs.ts';
import { listRemotes } from './repository.ts';

export interface FetchedPullRequest {
  baseBranch: string;
  baseSha: string;
  headSha: string;
}

export interface FetchPullRequestRequest {
  repoPath: string;
  remote: string;
  number: number;
  /** The PR's base branch when known (from `gh`); otherwise the remote's default branch. */
  baseBranch: string | null;
}

const SSH_AUTH_FAILURE = /Permission denied|publickey|Host key verification failed/i;
const SSH_UNREACHABLE =
  /Connection refused|Could not resolve hostname|Operation timed out|Connection timed out|No route to host/i;

export const SSH_AUTH_FAILED_MESSAGE =
  'SSH authentication failed. Load your key into the SSH agent (ssh-add) and try again.';

/** Turns a failed network Git command's stderr into an error the reviewer can act on. */
export const classifyNetworkFailure = (stderr: string): AppError => {
  if (SSH_AUTH_FAILURE.test(stderr)) {
    return new AppError(ErrorCode.sshAuthFailed, 502, SSH_AUTH_FAILED_MESSAGE);
  }
  if (SSH_UNREACHABLE.test(stderr)) {
    return new AppError(
      ErrorCode.gitFailed,
      502,
      'Could not reach the remote over SSH. Check the network connection and try again.',
    );
  }
  return new AppError(ErrorCode.gitFailed, 502, maskSecrets(stderr) || 'git fetch failed');
};

const requireSshRemote = async (
  git: GitClient,
  repoPath: string,
  name: string,
): Promise<RemoteSummary> => {
  const remote = (await listRemotes(git, repoPath)).find((candidate) => candidate.name === name);
  if (remote === undefined) {
    throw new AppError(ErrorCode.remoteNotFound, 404, `No remote named ${name}`);
  }
  if (!remote.ssh) {
    throw new AppError(
      ErrorCode.remoteNotSsh,
      400,
      `Fetching a pull request needs an SSH remote; ${name} uses ${remote.url}`,
    );
  }
  return remote;
};

/** Runs a network Git command and turns an SSH failure into a message the reviewer can act on. */
const runNetwork = async (git: GitClient, repoPath: string, args: string[]): Promise<string> => {
  const result = await git.exec(repoPath, args, NETWORK_GIT_TIMEOUT_MS);
  if (result.exitCode === 0) {
    return result.stdout;
  }
  throw classifyNetworkFailure(result.stderr);
};

const parseLsRemote = (output: string): Map<string, string> =>
  new Map(
    output
      .split('\n')
      .map((line) => line.split('\t'))
      .filter((parts): parts is [string, string] => parts.length === 2)
      .map(([sha, ref]) => [ref, sha]),
  );

const defaultBranch = async (git: GitClient, repoPath: string, remote: string): Promise<string> => {
  const output = await runNetwork(git, repoPath, [
    'ls-remote',
    '--symref',
    '--end-of-options',
    remote,
    'HEAD',
  ]);
  const branch = /^ref: refs\/heads\/(\S+)\tHEAD$/m.exec(output)?.[1];
  if (branch === undefined) {
    throw new AppError(ErrorCode.gitFailed, 502, `Could not find the default branch of ${remote}`);
  }
  return branch;
};

/**
 * Fetches a pull request's head and base commits over the remote's SSH URL. Nothing is written
 * but objects: no branch, tag, remote-tracking ref or FETCH_HEAD.
 */
const hasCommit = async (git: GitClient, repoPath: string, sha: string): Promise<boolean> =>
  (await git.exec(repoPath, ['cat-file', '-e', `${sha}^{commit}`])).exitCode === 0;

const haveAll = async (git: GitClient, repoPath: string, shas: string[]): Promise<boolean> =>
  (await Promise.all(shas.map((sha) => hasCommit(git, repoPath, sha)))).every(Boolean);

export const fetchPullRequest = async (
  git: GitClient,
  { repoPath, remote, number, baseBranch }: FetchPullRequestRequest,
): Promise<FetchedPullRequest> => {
  await requireSshRemote(git, repoPath, remote);
  const base = validateRef(baseBranch ?? (await defaultBranch(git, repoPath, remote)));
  const headRef = `refs/pull/${number}/head`;
  const baseRef = `refs/heads/${base}`;

  const tips = parseLsRemote(
    await runNetwork(git, repoPath, ['ls-remote', '--end-of-options', remote, headRef, baseRef]),
  );
  const headSha = tips.get(headRef);
  const baseSha = tips.get(baseRef);
  if (headSha === undefined) {
    throw new AppError(
      ErrorCode.prNotFound,
      404,
      `Pull request #${number} was not found on ${remote}`,
    );
  }
  if (baseSha === undefined) {
    throw new AppError(ErrorCode.unknownRef, 404, `Branch ${base} was not found on ${remote}`);
  }

  // ls-remote above always runs, so the tips are current; the download is skipped when the
  // clone already holds both commits (e.g. the same PR opened again with no new pushes).
  if (await haveAll(git, repoPath, [headSha, baseSha])) {
    return { baseBranch: base, baseSha, headSha };
  }
  await runNetwork(git, repoPath, [
    'fetch',
    '--no-tags',
    '--no-write-fetch-head',
    '--no-recurse-submodules',
    '--refmap=',
    '--end-of-options',
    remote,
    headRef,
    baseRef,
  ]);
  for (const sha of [headSha, baseSha]) {
    if (!(await hasCommit(git, repoPath, sha))) {
      throw new AppError(
        ErrorCode.gitFailed,
        502,
        `Fetched, but commit ${sha.slice(0, 7)} is missing`,
      );
    }
  }
  return { baseBranch: base, baseSha, headSha };
};
