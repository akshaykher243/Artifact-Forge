import type { PrRef, PullRequest } from '../../shared/pull-request.ts';

/** The pull request a comparison was made for. */
export interface PrContext {
  repoPath: string;
  remote: string;
  ref: PrRef;
  /** From gh; null when gh is not installed or not signed in. */
  details: PullRequest | null;
}
