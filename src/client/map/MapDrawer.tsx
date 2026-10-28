import type { JSX, ReactNode } from 'react';

import { useFileDiff } from '../diff/diff-store.ts';
import { useWorkspace } from '../workspace/workspace-state.ts';
import styles from './MapDrawer.module.css';
import type { MapSelection } from './selection.ts';
import { UnifiedRows } from './UnifiedRows.tsx';

const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

interface FileDiffBodyProps {
  fileIndex: number;
}

const FileDiffBody = ({ fileIndex }: FileDiffBodyProps): JSX.Element | null => {
  const entry = useFileDiff(fileIndex, true);
  if (entry.state === 'failed') {
    return <p className={styles.note}>{entry.message}</p>;
  }
  if (entry.state !== 'ready' || entry.diff.kind !== 'rows') {
    return null;
  }
  return <UnifiedRows rows={entry.diff.rows} />;
};

interface DrawerContent {
  title: string;
  path: string;
  add: string;
  del: string;
  /** The file the `Mark reviewed` box and `Open in Diff view` act on, if any. */
  reviewPath: string | null;
  openPath: string | null;
  body: ReactNode;
}

const useDrawerContent = (selection: MapSelection): DrawerContent => {
  const { comparison, dispatch } = useWorkspace();
  if (selection.kind === 'folder') {
    return {
      title: selection.name,
      path: `directory · ${selection.files.length} files`,
      add: `+${selection.additions}`,
      del: `−${selection.deletions}`,
      reviewPath: null,
      openPath: null,
      body: (
        <div className={styles.files}>
          {selection.files.map((file) => (
            <button
              key={file.path}
              type="button"
              className={styles.fileRow}
              onClick={() => dispatch({ type: 'focusMapNode', level: 'package', id: file.path })}
            >
              <span className={styles.fileName}>{baseName(file.path)}</span>
              <span>
                <span className={styles.add}>+{file.additions}</span>{' '}
                <span className={styles.del}>−{file.deletions}</span>
              </span>
            </button>
          ))}
        </div>
      ),
    };
  }
  if (selection.kind === 'file') {
    const { file } = selection;
    const fileIndex = comparison.files.findIndex((changed) => changed.path === file.path);
    return {
      title: baseName(file.path),
      path: file.path,
      add: `+${file.additions}`,
      del: `−${file.deletions}`,
      reviewPath: selection.changed ? file.path : null,
      openPath: file.path,
      body: fileIndex === -1 ? null : <FileDiffBody fileIndex={fileIndex} />,
    };
  }
  const { fn } = selection;
  return {
    title: fn.name,
    path: `${fn.file}:${fn.line}`,
    add: fn.change !== null && fn.add ? `+${fn.add}` : '',
    del: fn.change !== null && fn.del ? `−${fn.del}` : '',
    reviewPath: null,
    openPath: fn.file,
    body: <UnifiedRows rows={fn.rows} />,
  };
};

export interface MapDrawerProps {
  selection: MapSelection;
}

/** The artifact's map drawer: details of the selected folder, file or function. */
export const MapDrawer = ({ selection }: MapDrawerProps): JSX.Element => {
  const { state, dispatch, setReviewed } = useWorkspace();
  const content = useDrawerContent(selection);
  const { reviewPath, openPath } = content;
  return (
    <aside
      className={styles.drawer}
      style={{ flexBasis: `${state.mapDrawerWidth}px`, width: `${state.mapDrawerWidth}px` }}
      aria-label={content.title}
    >
      <div className={styles.header}>
        <span className={styles.titleBlock}>
          <span className={styles.title}>{content.title}</span>
          <span className={styles.path}>{content.path}</span>
        </span>
        <span className={styles.counts}>
          <span className={styles.add}>{content.add}</span>{' '}
          <span className={styles.del}>{content.del}</span>
        </span>
        {reviewPath !== null && (
          <input
            type="checkbox"
            className={styles.check}
            checked={state.reviewed.has(reviewPath)}
            onChange={(event) => setReviewed(reviewPath, event.target.checked)}
            aria-label="Mark reviewed"
          />
        )}
        <button
          type="button"
          className={styles.close}
          aria-label="Close panel"
          onClick={() => dispatch({ type: 'clearMapSelection' })}
        >
          ✕
        </button>
      </div>
      {/* Focusable so keyboard users can scroll long diffs. */}
      <div
        className={styles.body}
        tabIndex={0}
        role="region"
        aria-label={`${content.title} details`}
      >
        {content.body}
      </div>
      <div className={styles.footer}>
        <button
          type="button"
          className={styles.open}
          onClick={() =>
            dispatch(
              openPath === null
                ? { type: 'showView', view: 'diff' }
                : { type: 'openInDiff', path: openPath },
            )
          }
        >
          Open in Diff view
        </button>
      </div>
    </aside>
  );
};
