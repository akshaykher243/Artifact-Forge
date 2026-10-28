import { useMemo, useReducer } from 'react';
import type { JSX } from 'react';

import type { Comparison } from '../../shared/comparison.ts';
import { createDiffStore, DiffStoreContext } from '../diff/diff-store.ts';
import { ReviewActionsContext, ReviewStateContext } from '../drafts/review-state.ts';
import { ReviewDrawer } from '../drafts/ReviewDrawer.tsx';
import { useReviewController } from '../drafts/use-review-controller.ts';
import type { PrContext } from '../pr/pr-context.ts';
import { Resizer } from '../ui/Resizer.tsx';
import { MainPanel } from './MainPanel.tsx';
import { Sidebar } from './Sidebar.tsx';
import { useReviewMarks } from './use-review-marks.ts';
import styles from './Workspace.module.css';
import {
  DRAWER_WIDTH,
  initialWorkspaceState,
  SIDEBAR_WIDTH,
  WorkspaceActionsContext,
  WorkspaceContext,
  workspaceReducer,
} from './workspace-state.ts';

export interface WorkspaceProps {
  comparison: Comparison;
  /** The pull request this comparison was made for, if any. */
  pr: PrContext | null;
  onChangeComparison: (() => void) | null;
  /** Called with the new comparison after the pull request is fetched again. */
  onPrReloaded: (comparison: Comparison, pr: PrContext) => void;
}

export const Workspace = ({
  comparison,
  pr,
  onChangeComparison,
  onPrReloaded,
}: WorkspaceProps): JSX.Element => {
  const [state, dispatch] = useReducer(workspaceReducer, initialWorkspaceState);
  const diffStore = useMemo(() => createDiffStore(comparison.id), [comparison.id]);
  const setReviewed = useReviewMarks(comparison, dispatch);
  const review = useReviewController(comparison, pr?.ref ?? null, dispatch);
  const context = useMemo(
    () => ({ comparison, onChangeComparison, pr, state, dispatch, setReviewed }),
    [comparison, onChangeComparison, pr, state, setReviewed],
  );
  const actions = useMemo(() => ({ dispatch, setReviewed }), [setReviewed]);

  return (
    <WorkspaceContext.Provider value={context}>
      <WorkspaceActionsContext.Provider value={actions}>
        <ReviewStateContext.Provider value={review.state}>
          <ReviewActionsContext.Provider value={review.actions}>
            <DiffStoreContext.Provider value={diffStore}>
              <div className={styles.workspace}>
                <Sidebar onPrReloaded={onPrReloaded} />
                <Resizer
                  label="Resize sidebar"
                  width={state.sidebarWidth}
                  direction={1}
                  onResize={(width) => dispatch({ type: 'setSidebarWidth', width })}
                  onReset={() =>
                    dispatch({ type: 'setSidebarWidth', width: SIDEBAR_WIDTH.initial })
                  }
                />
                <MainPanel />
                {state.drawerOpen && (
                  <>
                    <Resizer
                      label="Resize review panel"
                      width={state.drawerWidth}
                      direction={-1}
                      onResize={(width) => dispatch({ type: 'setDrawerWidth', width })}
                      onReset={() =>
                        dispatch({ type: 'setDrawerWidth', width: DRAWER_WIDTH.initial })
                      }
                    />
                    <ReviewDrawer />
                  </>
                )}
              </div>
            </DiffStoreContext.Provider>
          </ReviewActionsContext.Provider>
        </ReviewStateContext.Provider>
      </WorkspaceActionsContext.Provider>
    </WorkspaceContext.Provider>
  );
};
