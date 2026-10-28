import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';

import type { SubmissionSummary } from '../../shared/submission.ts';
import styles from './Submit.module.css';

const plural = (count: number, word: string): string => `${count} ${word}${count === 1 ? '' : 's'}`;

export interface ConfirmDialogProps {
  summary: SubmissionSummary;
  posting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** The last step before anything leaves the machine: what, where, as whom. */
export const ConfirmDialog = ({
  summary,
  posting,
  onConfirm,
  onCancel,
}: ConfirmDialogProps): JSX.Element => {
  const ref = useRef<HTMLDialogElement>(null);
  const finished = summary.state !== 'OPEN';
  const [acknowledged, setAcknowledged] = useState(false);

  useEffect(() => {
    ref.current?.showModal();
  }, []); // Opens once when mounted; the parent unmounts it to close.

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="confirm-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!posting) {
          onCancel();
        }
      }}
    >
      <h2 id="confirm-title" className={styles.dialogTitle}>
        Post this review to GitHub?
      </h2>
      <dl className={styles.facts}>
        <dt>Pull request</dt>
        <dd>
          {summary.owner}/{summary.name} #{summary.number} · {summary.title}
        </dd>
        <dt>Branches</dt>
        <dd>
          {summary.baseRefName} ← {summary.headRefName} · {summary.headSha.slice(0, 7)}
        </dd>
        <dt>Action</dt>
        <dd>{summary.action}</dd>
        <dt>Posting as</dt>
        <dd>{summary.login}</dd>
        <dt>Contents</dt>
        <dd>
          {plural(summary.inlineCount, 'inline comment')}
          {summary.hasOverall ? ' and an overall comment' : ', no overall comment'}
        </dd>
        {summary.outdatedCount > 0 && (
          <>
            <dt>Left out</dt>
            <dd>
              {plural(summary.outdatedCount, 'outdated draft')} (move or delete them first to
              include them)
            </dd>
          </>
        )}
      </dl>
      {finished && (
        <label className={styles.acknowledge}>
          <input
            type="checkbox"
            checked={acknowledged}
            onChange={(event) => setAcknowledged(event.target.checked)}
          />
          This pull request is {summary.state === 'MERGED' ? 'merged' : 'closed'}. Post anyway.
        </label>
      )}
      <div className={styles.dialogActions}>
        <button
          type="button"
          className={styles.primary}
          disabled={posting || (finished && !acknowledged)}
          onClick={onConfirm}
        >
          {posting ? 'Posting…' : 'Post review'}
        </button>
        <button type="button" className={styles.button} disabled={posting} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </dialog>
  );
};
