import { memo, useMemo, useRef } from 'react';
import type { JSX } from 'react';

import { sideLines } from '../../shared/anchor.ts';
import type { ChangedFile, DiffRow, FileDiff } from '../../shared/comparison.ts';
import type { DraftSide } from '../../shared/review.ts';
import { CommentComposer } from '../drafts/CommentComposer.tsx';
import { DraftRow } from '../drafts/DraftRow.tsx';
import draftStyles from '../drafts/Drafts.module.css';
import { useReviewActions } from '../drafts/review-state.ts';
import type { FileReview } from '../drafts/review-state.ts';
import { useNearViewport } from '../ui/use-near-viewport.ts';
import { useWorkspaceActions } from '../workspace/workspace-state.ts';
import styles from './DiffSection.module.css';
import { useFileDiff } from './diff-store.ts';
import type { DiffEntry } from './diff-store.ts';
import { languageBadge } from './language-badge.ts';
import { toSplit } from './render.ts';
import { SplitRows } from './SplitRows.tsx';
import type { Commenting } from './SplitRows.tsx';

interface DiffBodyProps {
  diff: FileDiff;
  file: ChangedFile;
  fileIndex: number;
  review: FileReview;
}

const hunkMaps = (rows: readonly DiffRow[]): Record<DraftSide, Map<number, number>> => ({
  old: new Map(sideLines(rows, 'old').map(({ line, hunk }) => [line, hunk])),
  new: new Map(sideLines(rows, 'new').map(({ line, hunk }) => [line, hunk])),
});

const DiffBody = ({ diff, file, fileIndex, review }: DiffBodyProps): JSX.Element => {
  const { pickLine, pickRange, refuseRange } = useReviewActions();
  const rows = useMemo(() => (diff.kind === 'rows' ? diff.rows : []), [diff]);
  const lines = useMemo(() => toSplit(rows), [rows]);
  const hunks = useMemo(() => hunkMaps(rows), [rows]);
  if (diff.kind === 'notice') {
    return <p className={styles.notice}>{diff.notice}</p>;
  }
  const { composer } = review;
  const commenting: Commenting = {
    selected: composer && { side: composer.side, start: composer.startLine, end: composer.endLine },
    onPick: (side, line, extend) => {
      const crossing =
        extend &&
        composer !== null &&
        (composer.side !== side || hunks[side].get(line) !== hunks[side].get(composer.startLine));
      if (crossing) {
        refuseRange(file.path);
        return;
      }
      pickLine(fileIndex, file.path, side, line, extend);
    },
    onPickRange: (side, start, end) => pickRange(fileIndex, file.path, side, start, end),
    sameHunk: (side, a, b) => {
      const hunk = hunks[side].get(a);
      return hunk !== undefined && hunk === hunks[side].get(b);
    },
    renderAfter: (side, line) => (
      <>
        {review.drafts
          .filter(
            (draft) =>
              draft.side === side && draft.endLine === line && draft.id !== composer?.draftId,
          )
          .map((draft) => (
            <DraftRow key={draft.id} draft={draft} focused={draft.id === review.focusedDraftId} />
          ))}
        {composer && composer.side === side && composer.endLine === line && (
          <CommentComposer
            // One comment-box session: fixed while typing and autosaving, new for each draft opened.
            key={`${composer.side}:${composer.startLine}:${composer.endLine}:${composer.originalBody === null ? 'new' : composer.draftId}`}
            composer={composer}
          />
        )}
      </>
    ),
  };
  return (
    <>
      {review.rangeError && (
        <p className={draftStyles.rangeError} role="alert">
          {review.rangeError}
        </p>
      )}
      <SplitRows lines={lines} commenting={commenting} />
    </>
  );
};

interface SectionBodyProps {
  entry: DiffEntry;
  file: ChangedFile;
  fileIndex: number;
  review: FileReview;
}

const SectionBody = ({ entry, file, fileIndex, review }: SectionBodyProps): JSX.Element => {
  if (entry.state === 'ready') {
    return <DiffBody diff={entry.diff} file={file} fileIndex={fileIndex} review={review} />;
  }
  if (entry.state === 'failed') {
    return (
      <p className={styles.notice} role="alert">
        {entry.message}
      </p>
    );
  }
  if (entry.state === 'idle') {
    return <p className={styles.notice}>Diff loads when it scrolls into view.</p>;
  }
  return <p className={styles.notice}>Loading diff…</p>;
};

export interface DiffSectionProps {
  file: ChangedFile;
  fileIndex: number;
  open: boolean;
  reviewed: boolean;
  review: FileReview;
  /** Shown when the section is the only one on screen, to return to every file. */
  onBack: (() => void) | null;
}

/** Memoised on its props, so a change to one file's state re-renders only that section. */
export const DiffSection = memo(
  ({ file, fileIndex, open, reviewed, review, onBack }: DiffSectionProps): JSX.Element => {
    const { dispatch, setReviewed } = useWorkspaceActions();
    const ref = useRef<HTMLElement>(null);
    const near = useNearViewport(ref);
    const entry = useFileDiff(fileIndex, open && near);

    return (
      <section ref={ref} className={styles.section} aria-label={file.path}>
        <div className={styles.header}>
          <button
            type="button"
            className={styles.caret}
            aria-expanded={open}
            aria-label={`${open ? 'Fold' : 'Unfold'} ${file.path}`}
            onClick={() => dispatch({ type: 'toggleSection', path: file.path })}
          >
            {open ? '▾' : '▸'}
          </button>
          <span className={styles.lang}>{languageBadge(file.path)}</span>
          <span className={styles.title}>
            <span className={styles.name}>{file.path.slice(file.path.lastIndexOf('/') + 1)}</span>{' '}
            <span className={styles.path}>{file.path}</span>
          </span>
          <span className={styles.counts}>
            <span className={styles.add}>+{file.additions}</span>{' '}
            <span className={styles.del}>−{file.deletions}</span>
          </span>
          {onBack && (
            <button type="button" className={styles.back} onClick={onBack}>
              Back to all files
            </button>
          )}
          <input
            type="checkbox"
            className={styles.check}
            checked={reviewed}
            aria-label={`Mark ${file.path} reviewed`}
            onChange={() => setReviewed(file.path, !reviewed)}
          />
        </div>
        {open && <SectionBody entry={entry} file={file} fileIndex={fileIndex} review={review} />}
      </section>
    );
  },
);
