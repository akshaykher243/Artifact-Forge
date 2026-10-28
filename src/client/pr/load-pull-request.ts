import type { Comparison } from '../../shared/comparison.ts';
import type { GhStatus } from '../../shared/pull-request.ts';
import { callOperation } from '../app/api.ts';
import type { PrContext } from './pr-context.ts';

export interface PullRequestRequest {
  repoPath: string;
  remote: string;
  owner: string;
  name: string;
  number: number;
}

export interface LoadedPullRequest {
  comparison: Comparison;
  pr: PrContext;
}

/**
 * Reads the pull request through gh when it is signed in, fetches its commits over SSH, and
 * compares them the way GitHub does. Without gh the review still works; posting does not.
 */
export const loadPullRequest = async (
  request: PullRequestRequest,
  status: GhStatus,
): Promise<LoadedPullRequest> => {
  const { repoPath, remote, number } = request;
  const details = status.signedIn
    ? await callOperation('readPr', { repo: repoPath, remote, number })
    : null;
  const fetched = await callOperation('fetchPr', {
    repo: repoPath,
    remote,
    number,
    baseBranch: details?.baseRefName ?? null,
  });
  const comparison = await callOperation('compare', {
    source: 'git',
    repo: repoPath,
    base: fetched.baseSha,
    head: fetched.headSha,
    baseLabel: fetched.baseBranch,
    headLabel: details?.headRefName ?? `#${number}`,
  });
  return {
    comparison,
    pr: {
      repoPath,
      remote,
      ref: { owner: request.owner, name: request.name, number },
      details,
    },
  };
};
