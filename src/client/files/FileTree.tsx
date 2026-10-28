import { memo, useMemo } from 'react';
import type { JSX } from 'react';

import { FileStatus } from '../../shared/comparison.ts';
import type { ChangedFile } from '../../shared/comparison.ts';
import { filterFiles, useWorkspace, useWorkspaceActions } from '../workspace/workspace-state.ts';
import { buildCompactList, buildFileTree } from './file-tree.ts';
import styles from './FileTree.module.css';

const INDENT_BASE_PX = 14;
const INDENT_STEP_PX = 14;
const COMPACT_INDENT_PX = 18;

const MARK_CLASS: Record<ChangedFile['status'], string | undefined> = {
  [FileStatus.added]: styles.markAdded,
  [FileStatus.modified]: styles.markModified,
  [FileStatus.renamed]: styles.markRenamed,
  [FileStatus.deleted]: styles.markDeleted,
};

const markOf = (status: ChangedFile['status']): string => {
  if (status === FileStatus.added) {
    return '+';
  }
  if (status === FileStatus.deleted) {
    return '−';
  }
  return '●';
};

const indentOf = (depth: number): string => `${INDENT_BASE_PX + depth * INDENT_STEP_PX}px`;

interface DirButtonProps {
  path: string;
  name: string;
  depth: number;
  open: boolean;
}

const DirButton = memo(({ path, name, depth, open }: DirButtonProps): JSX.Element => {
  const { dispatch } = useWorkspaceActions();
  return (
    <button
      type="button"
      className={styles.dir}
      style={{ paddingLeft: indentOf(depth) }}
      aria-expanded={open}
      onClick={() => dispatch({ type: 'toggleDir', path })}
    >
      <span className={styles.caret} aria-hidden="true">
        {open ? '▾' : '▸'}
      </span>
      <span className={styles.name}>{name}</span>
    </button>
  );
});

interface FileButtonProps {
  file: ChangedFile;
  name: string;
  depth: number;
  compact: boolean;
  reviewed: boolean;
  selected: boolean;
}

const FileButton = memo(
  ({ file, name, depth, compact, reviewed, selected }: FileButtonProps): JSX.Element => {
    const { dispatch } = useWorkspaceActions();
    const reviewedLabel = compact ? '✓' : 'Reviewed';
    const classes = [styles.file, compact && styles.compact, selected && styles.selected];
    return (
      <button
        type="button"
        className={classes.filter(Boolean).join(' ')}
        style={{ paddingLeft: compact ? `${COMPACT_INDENT_PX}px` : indentOf(depth) }}
        title={file.path}
        aria-current={selected ? 'true' : undefined}
        onClick={() => dispatch({ type: 'pickFile', path: file.path })}
      >
        <span className={`${styles.mark} ${MARK_CLASS[file.status] ?? ''}`} aria-hidden="true">
          {markOf(file.status)}
        </span>
        <span className={reviewed ? `${styles.name} ${styles.done}` : styles.name}>{name}</span>
        <span className={styles.srOnly}> ({file.status})</span>
        <span className={styles.counts}>
          {reviewed ? (
            <span className={compact ? styles.add : styles.doneLabel}>{reviewedLabel}</span>
          ) : (
            <>
              <span className={styles.add}>+{file.additions}</span>{' '}
              <span className={styles.del}>−{file.deletions}</span>
            </>
          )}
        </span>
      </button>
    );
  },
);

export const FileTree = (): JSX.Element => {
  const { comparison, state } = useWorkspace();
  const rows = useMemo(() => {
    const files = filterFiles(comparison.files, state.filter);
    return state.compact ? buildCompactList(files) : buildFileTree(files, state.closedDirs);
  }, [comparison.files, state.filter, state.compact, state.closedDirs]);
  return (
    <nav className={styles.tree} aria-label="Changed files">
      {rows.map((row) =>
        row.kind === 'dir' ? (
          <DirButton
            key={`dir:${row.path}`}
            path={row.path}
            name={row.name}
            depth={row.depth}
            open={row.open}
          />
        ) : (
          <FileButton
            key={`file:${row.file.path}`}
            file={row.file}
            name={row.name}
            depth={row.depth}
            compact={state.compact}
            reviewed={state.reviewed.has(row.file.path)}
            selected={state.selectedPath === row.file.path}
          />
        ),
      )}
    </nav>
  );
};
