import { useCallback, useMemo } from 'react';
import type { JSX } from 'react';

import type { ChangedFile, Comparison } from '../../shared/comparison.ts';
import { DiffSection } from '../diff/DiffSection.tsx';
import { useReviewState } from '../drafts/review-state.ts';
import { useFileReviews } from '../drafts/use-file-reviews.ts';
import { treeOrder } from '../files/file-tree.ts';
import { MapView } from '../map/MapView.tsx';
import { useDependencyMap } from '../map/use-dependency-map.ts';
import styles from './MainPanel.module.css';
import { filterFiles, useWorkspace } from './workspace-state.ts';
import type { WorkspaceView } from './workspace-state.ts';

interface HeaderCopy {
  crumb: string;
  heading: string;
  subheading: string;
}

const headerFor = (
  comparison: Comparison,
  selected: ChangedFile | undefined,
  view: WorkspaceView,
): HeaderCopy => {
  if (view === 'map') {
    return {
      crumb: 'Diff overlay',
      heading: `${comparison.head.name} vs ${comparison.base.name}`,
      subheading: `${comparison.repo}, directory map`,
    };
  }
  if (selected) {
    return {
      crumb: 'Changed file',
      heading: selected.path,
      subheading: selected.oldPath ? `renamed from ${selected.oldPath}` : '',
    };
  }
  const count = comparison.files.length;
  return {
    crumb: 'All files',
    heading: `${count} changed ${count === 1 ? 'file' : 'files'}`,
    subheading: `${comparison.head.name} vs ${comparison.base.name}`,
  };
};

const VIEWS: ReadonlyArray<[WorkspaceView, string]> = [
  ['diff', 'Diff'],
  ['map', 'Map'],
];

const ViewSwitch = (): JSX.Element => {
  const { state, dispatch } = useWorkspace();
  return (
    <span className={styles.views}>
      {VIEWS.map(([view, label]) => (
        <button
          key={view}
          type="button"
          className={state.view === view ? `${styles.viewTab} ${styles.viewTabOn}` : styles.viewTab}
          aria-pressed={state.view === view}
          onClick={() => dispatch({ type: 'showView', view })}
        >
          {label}
        </button>
      ))}
    </span>
  );
};

export const MainPanel = (): JSX.Element => {
  const { comparison, state, dispatch } = useWorkspace();
  const reviewState = useReviewState();
  const reviewFor = useFileReviews(reviewState);
  const commentCount = reviewState.review.drafts.length;
  const ordered = useMemo(
    () => treeOrder(filterFiles(comparison.files, state.filter)),
    [comparison.files, state.filter],
  );
  const selected = comparison.files.find((file) => file.path === state.selectedPath);
  const shown = selected ? [selected] : ordered;
  const emptyMessage =
    comparison.files.length === 0
      ? `No changes between ${comparison.base.name} and ${comparison.head.name}.`
      : `No files match ${state.filter.trim()}.`;
  const header = headerFor(comparison, selected, state.view);
  const mapEntry = useDependencyMap(comparison.id, state.view === 'map');
  const goBack = useCallback(() => dispatch({ type: 'selectFile', path: null }), [dispatch]);
  const indexByPath = useMemo(
    () => new Map(comparison.files.map((file, index) => [file.path, index])),
    [comparison.files],
  );

  return (
    <main className={styles.main}>
      <div className={styles.header}>
        <span className={styles.crumb}>{header.crumb}</span>
        <h1 className={styles.heading}>{header.heading}</h1>
        <span className={styles.crumb}>{header.subheading}</span>
        <ViewSwitch />
        <button
          type="button"
          className={
            state.drawerOpen
              ? `${styles.reviewToggle} ${styles.reviewToggleOn}`
              : styles.reviewToggle
          }
          aria-pressed={state.drawerOpen}
          onClick={() => dispatch({ type: 'toggleDrawer' })}
        >
          Review{commentCount > 0 ? ` · ${commentCount}` : ''}
        </button>
      </div>
      {reviewState.notice && (
        <p className={styles.notice} role="alert">
          {reviewState.notice}
        </p>
      )}
      {state.view === 'map' && <MapView entry={mapEntry} />}
      <div className={styles.sections} hidden={state.view === 'map'}>
        {shown.length === 0 && <p className={styles.empty}>{emptyMessage}</p>}
        {shown.map((file) => (
          <DiffSection
            key={file.path}
            file={file}
            fileIndex={indexByPath.get(file.path) ?? -1}
            open={!state.foldedSections.has(file.path)}
            reviewed={state.reviewed.has(file.path)}
            review={reviewFor(file.path)}
            onBack={selected ? goBack : null}
          />
        ))}
      </div>
    </main>
  );
};
