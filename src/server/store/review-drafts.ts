import { randomUUID } from 'node:crypto';

import { DraftState, EMPTY_REVIEW, reviewStateSchema } from '../../shared/review.ts';
import type { Draft, ReviewState } from '../../shared/review.ts';
import { ErrorCode } from '../../shared/envelope.ts';
import { AppError } from '../errors.ts';
import type { JsonStore } from './json-store.ts';

export interface AnchoredDraft {
  id: string | undefined;
  path: string;
  side: Draft['side'];
  startLine: number;
  endLine: number;
  headSha: string;
  anchorText: string[];
  body: string;
}

export interface ReviewDrafts {
  load: (reviewKey: string) => Promise<ReviewState>;
  /** Creates or updates a draft and returns the review with the draft's id. */
  saveDraft: (
    reviewKey: string,
    draft: AnchoredDraft,
  ) => Promise<{ review: ReviewState; draftId: string }>;
  deleteDraft: (reviewKey: string, draftId: string) => Promise<ReviewState>;
  saveOverall: (reviewKey: string, body: string) => Promise<ReviewState>;
  /** Changes the whole review as one step (drafts, overall comment and submission records). */
  updateReview: (
    reviewKey: string,
    change: (review: ReviewState) => ReviewState,
  ) => Promise<ReviewState>;
  /** Replaces the drafts as one step, e.g. after re-checking them against a new head. */
  updateDrafts: (reviewKey: string, change: (drafts: Draft[]) => Draft[]) => Promise<ReviewState>;
}

const fileFor = (reviewKey: string): string => {
  if (!/^[a-z]+-[a-z0-9-]{1,80}$/.test(reviewKey)) {
    throw new Error(`Unexpected review key: ${reviewKey}`);
  }
  return `reviews/${reviewKey}.json`;
};

const isEditable = (draft: Draft): boolean => draft.state !== DraftState.submitted;

/**
 * Local review drafts. A review key names one review (a comparison now, a pull request once
 * one is identified). Submitted comments are kept for the record but can no longer change.
 */
export const createReviewDrafts = (
  store: JsonStore,
  now: () => Date = () => new Date(),
): ReviewDrafts => {
  const update = (reviewKey: string, change: (review: ReviewState) => ReviewState) =>
    store.update(fileFor(reviewKey), reviewStateSchema, EMPTY_REVIEW, change);

  return {
    load: async (reviewKey) => store.read(fileFor(reviewKey), reviewStateSchema, EMPTY_REVIEW),
    saveDraft: async (reviewKey, { id, ...anchored }) => {
      const draftId = id ?? randomUUID();
      const saved = await update(reviewKey, (review) => {
        const existing = review.drafts.find((draft) => draft.id === id);
        if (id !== undefined && (existing === undefined || !isEditable(existing))) {
          throw new AppError(
            ErrorCode.notFound,
            404,
            'That draft no longer exists or was already submitted',
          );
        }
        const draft: Draft = {
          ...anchored,
          id: draftId,
          state: DraftState.draft,
          reviewUrl: null,
          updatedAt: now().toISOString(),
        };
        const others = review.drafts.filter((candidate) => candidate.id !== draft.id);
        return { ...review, drafts: [...others, draft] };
      });
      return { review: saved, draftId };
    },
    deleteDraft: async (reviewKey, draftId) =>
      update(reviewKey, (review) => ({
        ...review,
        drafts: review.drafts.filter((draft) => draft.id !== draftId || !isEditable(draft)),
      })),
    saveOverall: async (reviewKey, body) =>
      update(reviewKey, (review) => ({ ...review, overall: body })),
    updateReview: async (reviewKey, change) => update(reviewKey, change),
    updateDrafts: async (reviewKey, change) =>
      update(reviewKey, (review) => ({ ...review, drafts: change(review.drafts) })),
  };
};
