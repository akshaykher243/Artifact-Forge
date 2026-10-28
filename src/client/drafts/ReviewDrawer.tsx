import { useMemo, useState } from 'react';
import type { JSX } from 'react';

import { DraftState } from '../../shared/review.ts';
import type { Draft } from '../../shared/review.ts';
import { treeOrder } from '../files/file-tree.ts';
import { SubmitPanel } from '../submit/SubmitPanel.tsx';
import { useWorkspace } from '../workspace/workspace-state.ts';
import { draftLocation, firstLine, orderDrafts } from './draft-order.ts';
import styles from './ReviewDrawer.module.css';
import { useReviewActions, useReviewState } from './review-state.ts';

const STATE_LABEL: Record<Draft['state'], string> = {
  [DraftState.draft]: 'Draft',
  [DraftState.outdated]: 'Outdated',
  [DraftState.submitted]: 'Submitted',
};

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`;

interface OverallCommentProps {
  initial: string;
}

const OverallComment = ({ initial }: OverallCommentProps): JSX.Element => {
  const { typeOverall } = useReviewActions();
  const { overallError } = useReviewState();
  const [text, setText] = useState(initial);
  return (
    <section className={styles.section} aria-label="Overall comment">
      <label className={styles.label} htmlFor="overall-comment">
        Overall comment
      </label>
      <textarea
        id="overall-comment"
        className={styles.textarea}
        value={text}
        rows={4}
        placeholder="Summarise your review"
        onChange={(event) => {
          setText(event.target.value);
          typeOverall(event.target.value);
        }}
      />
      {overallError && (
        <span className={styles.error} role="alert">
          {overallError}
        </span>
      )}
    </section>
  );
};

interface PendingListProps {
  drafts: Draft[];
}

const PendingList = ({ drafts }: PendingListProps): JSX.Element => {
  const { focusDraft } = useReviewActions();
  const { focusedDraftId } = useReviewState();
  const current = drafts.findIndex((draft) => draft.id === focusedDraftId);
  /** With nothing focused yet, Next starts at the first comment and Previous at the last. */
  const step = (offset: 1 | -1): void => {
    const count = drafts.length;
    const index =
      current === -1 ? (offset === 1 ? 0 : count - 1) : (current + offset + count) % count;
    const target = drafts[index];
    if (target) {
      focusDraft(target);
    }
  };

  if (drafts.length === 0) {
    return <p className={styles.empty}>No inline comments yet. Use + beside a line to add one.</p>;
  }
  return (
    <>
      <div className={styles.navigation}>
        <button type="button" className={styles.button} onClick={() => step(-1)}>
          Previous comment
        </button>
        <button type="button" className={styles.button} onClick={() => step(1)}>
          Next comment
        </button>
      </div>
      <ol className={styles.list}>
        {drafts.map((draft) => (
          <li key={draft.id}>
            <button
              type="button"
              className={
                draft.id === focusedDraftId ? `${styles.item} ${styles.current}` : styles.item
              }
              onClick={() => focusDraft(draft)}
            >
              <span className={styles.itemHeader}>
                <span className={styles.location}>{draftLocation(draft)}</span>
                <span className={styles.state}>{STATE_LABEL[draft.state]}</span>
              </span>
              <span className={styles.preview}>{firstLine(draft.body)}</span>
            </button>
          </li>
        ))}
      </ol>
    </>
  );
};

export const ReviewDrawer = (): JSX.Element => {
  const { comparison, state, dispatch } = useWorkspace();
  const review = useReviewState();
  const pathOrder = useMemo(
    () => treeOrder(comparison.files).map((file) => file.path),
    [comparison.files],
  );
  const drafts = useMemo(
    () => orderDrafts(review.review.drafts, pathOrder),
    [review.review.drafts, pathOrder],
  );
  const pending = drafts.filter((draft) => draft.state === DraftState.draft).length;
  const outdated = drafts.filter((draft) => draft.state === DraftState.outdated).length;

  return (
    <aside
      className={styles.drawer}
      style={{ width: `${state.drawerWidth}px` }}
      aria-label="Review"
    >
      <div className={styles.header}>
        <span className={styles.titleBlock}>
          <span className={styles.title}>Review</span>
          <span className={styles.counts}>
            {plural(pending, 'inline comment')}
            {outdated > 0 ? `, ${outdated} outdated` : ''}
            {review.review.overall.trim() === '' ? '' : ', overall comment'}
          </span>
        </span>
        <button
          type="button"
          className={styles.close}
          aria-label="Close review"
          onClick={() => dispatch({ type: 'toggleDrawer' })}
        >
          ✕
        </button>
      </div>
      <div className={styles.body}>
        {/* Remounts once the saved review has loaded, so the field starts from the saved text. */}
        <OverallComment key={String(review.loaded)} initial={review.review.overall} />
        <section className={styles.section} aria-label="Pending comments">
          <h2 className={styles.label}>Pending comments</h2>
          <PendingList drafts={drafts} />
        </section>
        <section className={styles.section} aria-label="Post review">
          <h2 className={styles.label}>Post to GitHub</h2>
          <SubmitPanel />
        </section>
      </div>
    </aside>
  );
};
