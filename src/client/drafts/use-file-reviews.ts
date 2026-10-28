import { useMemo, useRef } from 'react';

import type { Draft } from '../../shared/review.ts';
import { NO_REVIEW } from './review-state.ts';
import type { FileReview, ReviewUiState } from './review-state.ts';

const NO_DRAFTS: readonly Draft[] = [];

const sameReview = (a: FileReview, b: FileReview): boolean =>
  a.composer === b.composer &&
  a.rangeError === b.rangeError &&
  a.focusedDraftId === b.focusedDraftId &&
  a.drafts.length === b.drafts.length &&
  a.drafts.every((draft, index) => draft === b.drafts[index]);

/**
 * Splits the review into one object per file and reuses the previous object while nothing in
 * that file changed, so memoised sections without changes are not re-rendered.
 */
export const useFileReviews = (state: ReviewUiState): ((path: string) => FileReview) => {
  const previous = useRef(new Map<string, FileReview>());
  const byPath = useMemo(() => {
    const groups = new Map<string, Draft[]>();
    for (const draft of state.review.drafts) {
      groups.set(draft.path, [...(groups.get(draft.path) ?? []), draft]);
    }
    return groups;
  }, [state.review.drafts]);
  const focusedPath = state.review.drafts.find((draft) => draft.id === state.focusedDraftId)?.path;

  return (path) => {
    const next: FileReview = {
      drafts: byPath.get(path) ?? NO_DRAFTS,
      composer: state.composer?.path === path ? state.composer : null,
      rangeError: state.rangeError?.path === path ? state.rangeError.message : null,
      focusedDraftId: focusedPath === path ? state.focusedDraftId : null,
    };
    const cached = previous.current.get(path) ?? NO_REVIEW;
    if (sameReview(cached, next)) {
      return cached;
    }
    previous.current.set(path, next);
    return next;
  };
};
