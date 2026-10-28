import { createContext, useContext } from 'react';

import { EMPTY_REVIEW } from '../../shared/review.ts';
import type { Draft, DraftSide, ReviewState } from '../../shared/review.ts';

export const RANGE_REFUSED = 'A range must stay within one hunk on one side.';
export const DRAFT_NOT_SAVED = 'Draft not saved';

/** The comment box that is open, for a new draft or for editing an existing one. */
export interface Composer {
  fileIndex: number;
  path: string;
  side: DraftSide;
  startLine: number;
  endLine: number;
  /** Set once the draft has been saved at least once. */
  draftId: string | null;
  body: string;
  /** For an edit, the text before editing began, restored on cancel. */
  originalBody: string | null;
  error: string | null;
}

/** What a section needs to show and take comments; every field is specific to its file. */
export interface FileReview {
  drafts: readonly Draft[];
  composer: Composer | null;
  rangeError: string | null;
  focusedDraftId: string | null;
}

export const NO_REVIEW: FileReview = {
  drafts: [],
  composer: null,
  rangeError: null,
  focusedDraftId: null,
};

export interface ReviewUiState {
  /** False until the saved review has been read. */
  loaded: boolean;
  review: ReviewState;
  composer: Composer | null;
  /** The file whose range selection was refused, with the reason. */
  rangeError: { path: string; message: string } | null;
  focusedDraftId: string | null;
  overallError: string | null;
  /** An outdated draft waiting for the reviewer to pick its new line. */
  movingDraftId: string | null;
  /** A failure that has no comment box to show it in, e.g. loading or deleting. */
  notice: string | null;
}

export type ReviewAction =
  | { type: 'loaded'; review: ReviewState }
  | { type: 'reviewChanged'; review: ReviewState }
  /** The controller owns the comment box and hands over each new version of it. */
  | { type: 'setComposer'; composer: Composer | null }
  | { type: 'rangeRefused'; path: string }
  | { type: 'focusDraft'; draftId: string | null }
  | { type: 'setMoving'; draftId: string | null }
  | { type: 'notice'; message: string | null }
  | { type: 'overallSaved'; review: ReviewState }
  | { type: 'overallFailed' };

export const initialReviewUiState: ReviewUiState = {
  loaded: false,
  review: EMPTY_REVIEW,
  composer: null,
  rangeError: null,
  focusedDraftId: null,
  overallError: null,
  movingDraftId: null,
  notice: null,
};

export const reviewReducer = (state: ReviewUiState, action: ReviewAction): ReviewUiState => {
  switch (action.type) {
    case 'loaded':
      return { ...state, review: action.review, loaded: true };
    case 'reviewChanged':
      return { ...state, review: action.review };
    case 'setComposer':
      return {
        ...state,
        composer: action.composer,
        rangeError: action.composer === null ? state.rangeError : null,
      };
    case 'rangeRefused':
      return { ...state, rangeError: { path: action.path, message: RANGE_REFUSED } };
    case 'notice':
      return { ...state, notice: action.message };
    case 'setMoving':
      return { ...state, movingDraftId: action.draftId };
    case 'focusDraft':
      return { ...state, focusedDraftId: action.draftId };
    case 'overallSaved':
      return { ...state, review: action.review, overallError: null };
    case 'overallFailed':
      return { ...state, overallError: DRAFT_NOT_SAVED };
  }
};

export interface ReviewActions {
  /** A click on a line's comment button; with Shift it extends the open range. */
  pickLine: (
    fileIndex: number,
    path: string,
    side: DraftSide,
    line: number,
    extend: boolean,
  ) => void;
  /** A drag across lines of one hunk, from `start` to `end` in either direction. */
  pickRange: (fileIndex: number, path: string, side: DraftSide, start: number, end: number) => void;
  /** A Shift-click that would cross a hunk or switch sides. */
  refuseRange: (path: string) => void;
  typeComment: (body: string) => void;
  saveComment: () => Promise<void>;
  cancelComment: () => Promise<void>;
  editDraft: (draft: Draft) => void;
  deleteDraft: (draftId: string) => Promise<void>;
  typeOverall: (body: string) => void;
  focusDraft: (draft: Draft) => void;
  /** Adopts a review returned by another operation, e.g. after posting it. */
  replaceReview: (review: ReviewState) => void;
  /** Starts (or, with null, cancels) moving an outdated draft to a line the reviewer picks next. */
  moveDraft: (draft: Draft | null) => void;
}

export const ReviewStateContext = createContext<ReviewUiState | null>(null);
export const ReviewActionsContext = createContext<ReviewActions | null>(null);

export const useReviewState = (): ReviewUiState => {
  const value = useContext(ReviewStateContext);
  if (value === null) {
    throw new Error('useReviewState must be used inside the Workspace component');
  }
  return value;
};

export const useReviewActions = (): ReviewActions => {
  const value = useContext(ReviewActionsContext);
  if (value === null) {
    throw new Error('useReviewActions must be used inside the Workspace component');
  }
  return value;
};
