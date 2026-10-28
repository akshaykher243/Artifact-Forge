import { useCallback, useEffect } from 'react';
import type { Dispatch } from 'react';

import type { Comparison } from '../../shared/comparison.ts';
import { callOperation } from '../app/api.ts';
import type { WorkspaceAction } from './workspace-state.ts';

/** Loads this comparison's saved marks, and returns a setter that saves each change. */
export const useReviewMarks = (
  comparison: Comparison,
  dispatch: Dispatch<WorkspaceAction>,
): ((path: string, reviewed: boolean) => void) => {
  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        const { paths } = await callOperation('reviewMarks', { comparisonId: comparison.id });
        dispatch({ type: 'replaceReviewed', paths });
      } catch {
        dispatch({ type: 'marksLoadFailed' });
      }
    };
    void load();
  }, [comparison.id, dispatch]);

  return useCallback(
    (path: string, reviewed: boolean) => {
      const fileIndex = comparison.files.findIndex((file) => file.path === path);
      dispatch({ type: 'setReviewed', path, reviewed });
      const save = async (): Promise<void> => {
        try {
          const { paths } = await callOperation('setReviewed', {
            comparisonId: comparison.id,
            fileIndex,
            reviewed,
          });
          dispatch({ type: 'replaceReviewed', paths });
        } catch {
          dispatch({ type: 'reviewSaveFailed', path, reviewed });
        }
      };
      void save();
    },
    [comparison, dispatch],
  );
};
