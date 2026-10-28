import { createHash } from 'node:crypto';

import { anchorText } from '../../shared/anchor.ts';
import type { DiffRow } from '../../shared/comparison.ts';
import { ErrorCode } from '../../shared/envelope.ts';
import type { PrRef } from '../../shared/pull-request.ts';
import { pathsToRecheck, reanchorDrafts } from '../../shared/reanchor.ts';
import type { DraftInput, ReviewState } from '../../shared/review.ts';
import type { ComparisonSource } from '../comparison-source.ts';
import { AppError } from '../errors.ts';
import type { ReviewDrafts } from '../store/review-drafts.ts';

export type FileSource = Omit<ComparisonSource, 'compare'>;

/**
 * Names one review. With a pull request identified, drafts belong to that pull request and
 * survive new commits; otherwise they belong to the comparison (repository, merge base, head).
 */
export const reviewKeyOf = (comparisonId: string, pr: PrRef | null): string => {
  if (pr === null) {
    return `comparison-${comparisonId.replace(':', '-')}`;
  }
  const repository = createHash('sha256')
    .update(`${pr.owner}/${pr.name}`.toLowerCase())
    .digest('hex');
  return `pr-${repository.slice(0, 24)}-${pr.number}`;
};

export interface ReviewTarget {
  comparisonId: string;
  pr: PrRef | null;
  source: FileSource;
}

const COMMENT_PLACEMENT = 'Comments must be on lines in the diff, within one hunk on one side.';

export interface ReviewService {
  /** Loads the review and re-checks drafts written against an older head of the pull request. */
  load: (target: ReviewTarget) => Promise<ReviewState>;
  saveDraft: (
    target: ReviewTarget,
    draft: DraftInput,
  ) => Promise<{ review: ReviewState; draftId: string }>;
  deleteDraft: (target: ReviewTarget, draftId: string) => Promise<ReviewState>;
  saveOverall: (target: ReviewTarget, body: string) => Promise<ReviewState>;
}

const rowsByPath = async (
  { comparisonId, source }: ReviewTarget,
  paths: readonly string[],
): Promise<Map<string, readonly DiffRow[] | null>> => {
  const files = await source.changedFiles(comparisonId);
  const entries = await Promise.all(
    paths.map(async (path): Promise<[string, readonly DiffRow[] | null]> => {
      const index = files.findIndex((file) => file.path === path);
      if (index === -1) {
        return [path, null];
      }
      const diff = await source.fileDiff(comparisonId, index);
      return [path, diff.kind === 'rows' ? diff.rows : null];
    }),
  );
  return new Map(entries);
};

export const createReviewService = (drafts: ReviewDrafts): ReviewService => ({
  load: async (target) => {
    const key = reviewKeyOf(target.comparisonId, target.pr);
    const review = await drafts.load(key);
    const head = await target.source.headSha(target.comparisonId);
    const paths = pathsToRecheck(review.drafts, head);
    if (paths.length === 0) {
      return review;
    }
    const rows = await rowsByPath(target, paths);
    return drafts.updateDrafts(key, (current) =>
      reanchorDrafts(current, head, (path) => rows.get(path) ?? null),
    );
  },
  saveDraft: async (target, draft) => {
    const { comparisonId, source } = target;
    const file = await source.changedFile(comparisonId, draft.fileIndex);
    const diff = await source.fileDiff(comparisonId, draft.fileIndex);
    const anchored =
      diff.kind === 'rows'
        ? anchorText(diff.rows, draft.side, draft.startLine, draft.endLine)
        : null;
    if (anchored === null) {
      throw new AppError(ErrorCode.invalidInput, 400, COMMENT_PLACEMENT);
    }
    return drafts.saveDraft(reviewKeyOf(comparisonId, target.pr), {
      id: draft.id,
      path: file.path,
      side: draft.side,
      startLine: draft.startLine,
      endLine: draft.endLine,
      headSha: await source.headSha(comparisonId),
      anchorText: anchored,
      body: draft.body,
    });
  },
  deleteDraft: async (target, draftId) =>
    drafts.deleteDraft(reviewKeyOf(target.comparisonId, target.pr), draftId),
  saveOverall: async (target, body) =>
    drafts.saveOverall(reviewKeyOf(target.comparisonId, target.pr), body),
});
