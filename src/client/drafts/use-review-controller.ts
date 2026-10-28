import { useEffect, useMemo, useReducer, useRef } from 'react';
import type { Dispatch } from 'react';

import type { Comparison } from '../../shared/comparison.ts';
import type { PrRef } from '../../shared/pull-request.ts';
import { callOperation, OperationError } from '../app/api.ts';
import type { WorkspaceAction } from '../workspace/workspace-state.ts';
import { DRAFT_NOT_SAVED, initialReviewUiState, reviewReducer } from './review-state.ts';
import type { Draft } from '../../shared/review.ts';
import type { Composer, ReviewActions, ReviewUiState } from './review-state.ts';

const COMMENT_AUTOSAVE_MS = 400;
const OVERALL_AUTOSAVE_MS = 600;

type Timer = { current: ReturnType<typeof setTimeout> | null };

const clearTimer = (timer: Timer): void => {
  if (timer.current !== null) {
    clearTimeout(timer.current);
    timer.current = null;
  }
};

/**
 * Owns the review for one comparison: loads it, autosaves the open comment and the overall
 * comment as the reviewer types, and runs every save for the comment box in order.
 *
 * The comment box lives in a ref that each action updates before dispatching, so a save that
 * runs between a state change and the next render never acts on a box that was already closed.
 */
export const useReviewController = (
  comparison: Comparison,
  prRef: PrRef | null,
  workspaceDispatch: Dispatch<WorkspaceAction>,
): { state: ReviewUiState; actions: ReviewActions } => {
  const [state, dispatch] = useReducer(reviewReducer, initialReviewUiState);
  const composerRef = useRef<Composer | null>(null);
  const movingRef = useRef<Draft | null>(null);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const commentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const overallTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const review = await callOperation('loadReview', {
          comparisonId: comparison.id,
          pr: prRef,
        });
        dispatch({ type: 'loaded', review });
      } catch (error) {
        const reason = error instanceof OperationError ? ` ${error.message}` : '';
        dispatch({ type: 'notice', message: `Could not load your saved comments.${reason}` });
      }
    };
    void load();
  }, [comparison.id, prRef]);

  const actions = useMemo((): ReviewActions => {
    const comparisonId = comparison.id;
    const indexOf = new Map(comparison.files.map((file, index) => [file.path, index]));

    const setComposer = (composer: Composer | null): void => {
      composerRef.current = composer;
      dispatch({ type: 'setComposer', composer });
    };

    /** Applies a change only if the same comment box is still open. */
    const updateIfOpen = (opened: Composer, change: Partial<Composer>): void => {
      const current = composerRef.current;
      if (
        current !== null &&
        current.path === opened.path &&
        current.startLine === opened.startLine
      ) {
        setComposer({ ...current, ...change });
      }
    };

    const saveComposerNow = (): Promise<void> => {
      clearTimer(commentTimer);
      queue.current = queue.current.then(async () => {
        const composer = composerRef.current;
        if (composer === null || composer.body.trim() === '') {
          return;
        }
        try {
          const { review, draftId } = await callOperation('saveDraft', {
            comparisonId,
            pr: prRef,
            draft: {
              ...(composer.draftId === null ? {} : { id: composer.draftId }),
              fileIndex: composer.fileIndex,
              side: composer.side,
              startLine: composer.startLine,
              endLine: composer.endLine,
              body: composer.body,
            },
          });
          dispatch({ type: 'reviewChanged', review });
          updateIfOpen(composer, { draftId, error: null });
        } catch {
          updateIfOpen(composer, { error: DRAFT_NOT_SAVED });
        }
      });
      return queue.current;
    };

    const openComposer = async (composer: Composer): Promise<void> => {
      await saveComposerNow();
      setComposer(composer);
    };

    const deleteDraft = async (draftId: string): Promise<void> => {
      try {
        dispatch({
          type: 'reviewChanged',
          review: await callOperation('deleteDraft', { comparisonId, pr: prRef, draftId }),
        });
        if (composerRef.current?.draftId === draftId) {
          setComposer(null);
        }
      } catch {
        dispatch({ type: 'notice', message: 'Could not delete the draft. It is still saved.' });
      }
    };

    const moveTo = async (
      draft: Draft,
      target: { fileIndex: number; side: Draft['side']; line: number },
    ): Promise<void> => {
      try {
        const { review } = await callOperation('saveDraft', {
          comparisonId,
          pr: prRef,
          draft: {
            id: draft.id,
            fileIndex: target.fileIndex,
            side: target.side,
            startLine: target.line,
            endLine: target.line,
            body: draft.body,
          },
        });
        dispatch({ type: 'reviewChanged', review });
      } catch {
        dispatch({ type: 'rangeRefused', path: draft.path });
      }
    };

    const reviewActions: ReviewActions = {
      replaceReview: (review) => dispatch({ type: 'reviewChanged', review }),
      moveDraft: (draft) => {
        movingRef.current = draft;
        dispatch({ type: 'setMoving', draftId: draft?.id ?? null });
      },
      pickLine: (fileIndex, path, side, line, extend) => {
        const moving = movingRef.current;
        if (moving !== null) {
          movingRef.current = null;
          dispatch({ type: 'setMoving', draftId: null });
          void moveTo(moving, { fileIndex, side, line });
          return;
        }
        const open = composerRef.current;
        if (
          extend &&
          open !== null &&
          open.path === path &&
          open.side === side &&
          open.draftId === null
        ) {
          setComposer({
            ...open,
            startLine: Math.min(open.startLine, line),
            endLine: Math.max(open.endLine, line),
          });
          return;
        }
        void openComposer({
          fileIndex,
          path,
          side,
          startLine: line,
          endLine: line,
          draftId: null,
          body: '',
          originalBody: null,
          error: null,
        });
      },
      pickRange: (fileIndex, path, side, start, end) => {
        if (movingRef.current !== null) {
          // An outdated draft moves to one line: the line the drag ended on.
          reviewActions.pickLine(fileIndex, path, side, end, false);
          return;
        }
        void openComposer({
          fileIndex,
          path,
          side,
          startLine: Math.min(start, end),
          endLine: Math.max(start, end),
          draftId: null,
          body: '',
          originalBody: null,
          error: null,
        });
      },
      refuseRange: (path) => dispatch({ type: 'rangeRefused', path }),
      typeComment: (body) => {
        if (composerRef.current === null) {
          return;
        }
        // Keystrokes stay out of React state: the comment box renders its own text, and the
        // rest of the page (possibly 1,000 sections) has nothing that depends on it.
        composerRef.current = { ...composerRef.current, body };
        clearTimer(commentTimer);
        commentTimer.current = setTimeout(() => void saveComposerNow(), COMMENT_AUTOSAVE_MS);
      },
      saveComment: async () => {
        await saveComposerNow();
        const composer = composerRef.current;
        if (composer !== null && composer.error === null && composer.draftId !== null) {
          setComposer(null);
        }
      },
      cancelComment: async () => {
        clearTimer(commentTimer);
        await queue.current;
        const composer = composerRef.current;
        setComposer(null);
        if (composer === null || composer.draftId === null) {
          return;
        }
        if (composer.originalBody === null) {
          await deleteDraft(composer.draftId);
          return;
        }
        if (composer.body !== composer.originalBody) {
          const { review } = await callOperation('saveDraft', {
            comparisonId,
            pr: prRef,
            draft: {
              id: composer.draftId,
              fileIndex: composer.fileIndex,
              side: composer.side,
              startLine: composer.startLine,
              endLine: composer.endLine,
              body: composer.originalBody,
            },
          });
          dispatch({ type: 'reviewChanged', review });
        }
      },
      editDraft: (draft) => {
        void openComposer({
          fileIndex: indexOf.get(draft.path) ?? -1,
          path: draft.path,
          side: draft.side,
          startLine: draft.startLine,
          endLine: draft.endLine,
          draftId: draft.id,
          body: draft.body,
          originalBody: draft.body,
          error: null,
        });
      },
      deleteDraft,
      typeOverall: (body) => {
        clearTimer(overallTimer);
        overallTimer.current = setTimeout(() => {
          const save = async (): Promise<void> => {
            try {
              const review = await callOperation('saveOverall', { comparisonId, pr: prRef, body });
              dispatch({ type: 'overallSaved', review });
            } catch {
              dispatch({ type: 'overallFailed' });
            }
          };
          void save();
        }, OVERALL_AUTOSAVE_MS);
      },
      focusDraft: (draft) => {
        workspaceDispatch({ type: 'selectFile', path: draft.path });
        workspaceDispatch({ type: 'unfoldSection', path: draft.path });
        dispatch({ type: 'focusDraft', draftId: draft.id });
      },
    };
    return reviewActions;
  }, [comparison, prRef, workspaceDispatch]);

  return { state, actions };
};
