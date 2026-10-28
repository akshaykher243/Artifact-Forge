import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';

import { DraftState } from '../../shared/review.ts';
import type { Draft } from '../../shared/review.ts';
import { draftLocation } from './draft-order.ts';
import styles from './Drafts.module.css';
import { useReviewActions, useReviewState } from './review-state.ts';

const STATE_LABEL: Record<Draft['state'], string> = {
  [DraftState.draft]: 'Draft',
  [DraftState.outdated]: 'Outdated',
  [DraftState.submitted]: 'Submitted',
};

const STATE_CLASS: Record<Draft['state'], string | undefined> = {
  [DraftState.draft]: styles.isDraft,
  [DraftState.outdated]: styles.isOutdated,
  [DraftState.submitted]: styles.isSubmitted,
};

export interface DraftRowProps {
  draft: Draft;
  focused: boolean;
}

export const DraftRow = ({ draft, focused }: DraftRowProps): JSX.Element => {
  const { editDraft, deleteDraft, moveDraft } = useReviewActions();
  const { movingDraftId } = useReviewState();
  const outdated = draft.state === DraftState.outdated;
  const moving = movingDraftId === draft.id;
  const [confirming, setConfirming] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const editable = draft.state !== DraftState.submitted;

  useEffect(() => {
    if (focused) {
      ref.current?.scrollIntoView({ block: 'center' });
      ref.current?.focus();
    }
  }, [focused]);

  return (
    <div
      ref={ref}
      id={`draft-${draft.id}`}
      tabIndex={-1}
      className={[styles.draft, STATE_CLASS[draft.state], focused && styles.focused]
        .filter(Boolean)
        .join(' ')}
      aria-label={`${STATE_LABEL[draft.state]} comment on ${draftLocation(draft)}`}
    >
      <div className={styles.draftHeader}>
        <span className={styles.stateLabel}>{STATE_LABEL[draft.state]}</span>
        <span className={styles.location}>{draftLocation(draft)}</span>
        {draft.reviewUrl && (
          <a className={styles.link} href={draft.reviewUrl} target="_blank" rel="noreferrer">
            View on GitHub
          </a>
        )}
        {editable && !confirming && (
          <span className={styles.actions}>
            {outdated ? (
              <button type="button" className={styles.button} onClick={() => moveDraft(draft)}>
                Move here
              </button>
            ) : (
              <button type="button" className={styles.button} onClick={() => editDraft(draft)}>
                Edit
              </button>
            )}
            <button type="button" className={styles.button} onClick={() => setConfirming(true)}>
              Delete
            </button>
          </span>
        )}
        {confirming && (
          <span className={styles.actions} role="group" aria-label="Confirm delete">
            <span>Delete this draft?</span>
            <button
              type="button"
              className={styles.danger}
              onClick={() => void deleteDraft(draft.id)}
            >
              Delete
            </button>
            <button type="button" className={styles.button} onClick={() => setConfirming(false)}>
              Keep
            </button>
          </span>
        )}
      </div>
      {moving && (
        <p className={styles.moving} role="status">
          Click + beside a line to move this comment there.{' '}
          <button type="button" className={styles.button} onClick={() => moveDraft(null)}>
            Cancel move
          </button>
        </p>
      )}
      <p className={styles.body}>{draft.body}</p>
    </div>
  );
};
