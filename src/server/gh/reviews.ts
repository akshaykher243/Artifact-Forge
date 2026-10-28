import { createHash } from 'node:crypto';

import { z } from 'zod';

import { ErrorCode } from '../../shared/envelope.ts';
import type { PrRef } from '../../shared/pull-request.ts';
import { DraftState } from '../../shared/review.ts';
import type { Draft, ReviewState } from '../../shared/review.ts';
import { AppError } from '../errors.ts';
import type { ProcessResult } from '../security/run-process.ts';
import type { GhClient } from './gh-client.ts';
import { GITHUB_HOST } from './gh-client.ts';

const GITHUB_SIDE = { old: 'LEFT', new: 'RIGHT' } as const;

interface ReviewComment {
  path: string;
  body: string;
  line: number;
  side: 'LEFT' | 'RIGHT';
  start_line?: number;
  start_side?: 'LEFT' | 'RIGHT';
}

/** The body of GitHub's "create a review" request, always as a Comment review. */
export interface ReviewRequest {
  commit_id: string;
  event: 'COMMENT';
  body: string;
  comments: ReviewComment[];
}

export interface BuiltReview {
  request: ReviewRequest;
  /** The drafts the request includes (outdated and submitted ones are left out). */
  draftIds: string[];
  outdatedCount: number;
  hash: string;
}

const toComment = (draft: Draft): ReviewComment => {
  const side = GITHUB_SIDE[draft.side];
  const range =
    draft.startLine === draft.endLine ? {} : { start_line: draft.startLine, start_side: side };
  return { path: draft.path, body: draft.body, line: draft.endLine, side, ...range };
};

/** Builds the exact request from the stored review; the same review always gives the same hash. */
export const buildReviewRequest = (review: ReviewState, headSha: string): BuiltReview => {
  const included = review.drafts.filter((draft) => draft.state === DraftState.draft);
  const request: ReviewRequest = {
    commit_id: headSha,
    event: 'COMMENT',
    body: review.overall.trim(),
    comments: included.map(toComment),
  };
  return {
    request,
    draftIds: included.map((draft) => draft.id),
    outdatedCount: review.drafts.filter((draft) => draft.state === DraftState.outdated).length,
    hash: createHash('sha256').update(JSON.stringify(request)).digest('hex'),
  };
};

/**
 * The one GitHub API call the app makes directly through gh: create a review with its inline
 * comments in a single request, so the comments are posted together or not at all.
 */
export const postReview = (
  gh: GhClient,
  pr: PrRef,
  request: ReviewRequest,
): Promise<ProcessResult> =>
  gh.exec(
    [
      'api',
      '--hostname',
      GITHUB_HOST,
      '--method',
      'POST',
      `repos/${pr.owner}/${pr.name}/pulls/${pr.number}/reviews`,
      '--input',
      '-',
    ],
    JSON.stringify(request),
  );

// The link is shown as a clickable anchor, so only a github.com page is accepted.
const createdReviewSchema = z.object({
  id: z.number(),
  html_url: z.string().startsWith(`https://${GITHUB_HOST}/`),
});

/** The created review from gh's output, or null when the output is not what GitHub returns. */
export const parseCreatedReview = (stdout: string): { id: number; url: string } | null => {
  try {
    const parsed = createdReviewSchema.safeParse(JSON.parse(stdout));
    return parsed.success ? { id: parsed.data.id, url: parsed.data.html_url } : null;
  } catch {
    return null;
  }
};

const prReviewsSchema = z.object({
  reviews: z.array(
    z.object({
      author: z.object({ login: z.string() }).nullable(),
      body: z.string(),
      submittedAt: z.string().nullable(),
    }),
  ),
});

export interface PostedReview {
  login: string | null;
  body: string;
  submittedAt: string | null;
}

/** The reviews on a pull request, read through gh to settle a submission with an unknown outcome. */
export const listReviews = async (gh: GhClient, pr: PrRef): Promise<PostedReview[]> => {
  const output = await gh.run([
    'pr',
    'view',
    String(pr.number),
    '--repo',
    `${GITHUB_HOST}/${pr.owner}/${pr.name}`,
    '--json',
    'reviews',
  ]);
  let parsed;
  try {
    parsed = prReviewsSchema.safeParse(JSON.parse(output));
  } catch {
    parsed = null;
  }
  if (parsed === null || !parsed.success) {
    throw new AppError(ErrorCode.ghFailed, 502, 'gh returned the reviews in an unexpected shape');
  }
  return parsed.data.reviews.map((review) => ({
    login: review.author?.login ?? null,
    body: review.body,
    submittedAt: review.submittedAt,
  }));
};
