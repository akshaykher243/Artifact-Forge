import { useRef, useState } from 'react';
import type { JSX } from 'react';

import { DraftState, SubmissionState } from '../../shared/review.ts';
import type { Submission } from '../../shared/review.ts';
import type { SubmissionSummary } from '../../shared/submission.ts';
import { callOperation, OperationError } from '../app/api.ts';
import { useReviewActions, useReviewState } from '../drafts/review-state.ts';
import { useWorkspace } from '../workspace/workspace-state.ts';
import { ConfirmDialog } from './ConfirmDialog.tsx';
import styles from './Submit.module.css';

const messageOf = (error: unknown): string =>
  error instanceof OperationError ? error.message : 'Something went wrong.';

interface OutcomeProps {
  attempt: Submission | undefined;
  checking: boolean;
  onCheck: () => void;
}

const Outcome = ({ attempt, checking, onCheck }: OutcomeProps): JSX.Element | null => {
  if (attempt === undefined) {
    return null;
  }
  if (attempt.state === SubmissionState.submitted) {
    return (
      <p className={styles.success} role="status">
        Review posted.{' '}
        {attempt.reviewUrl && (
          <a href={attempt.reviewUrl} target="_blank" rel="noreferrer">
            View it on GitHub
          </a>
        )}
      </p>
    );
  }
  if (attempt.state === SubmissionState.failed) {
    return (
      <p className={styles.failure} role="alert">
        GitHub did not accept the review: {attempt.message}
      </p>
    );
  }
  if (attempt.state === SubmissionState.unknown) {
    return (
      <div className={styles.unknown} role="alert">
        <p>Outcome unknown. {attempt.message}</p>
        <button type="button" className={styles.button} disabled={checking} onClick={onCheck}>
          {checking ? 'Checking…' : 'Check GitHub for this review'}
        </button>
      </div>
    );
  }
  return <p className={styles.hint}>Posting…</p>;
};

export const SubmitPanel = (): JSX.Element => {
  const { comparison, pr } = useWorkspace();
  const { review } = useReviewState();
  const { replaceReview } = useReviewActions();
  const [summary, setSummary] = useState<SubmissionSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const posting = useRef(false);

  if (pr === null) {
    return (
      <p className={styles.hint}>
        Open this comparison as a pull request to post a review to GitHub.
      </p>
    );
  }
  const target = { comparisonId: comparison.id, pr: pr.ref };
  const pending = review.drafts.filter((draft) => draft.state === DraftState.draft).length;
  const nothingToSend = pending === 0 && review.overall.trim() === '';
  const latest = review.submissions.at(-1);
  const blocked = latest?.state === SubmissionState.unknown && latest.checkedAt === null;

  const prepare = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      setSummary(await callOperation('prepareSubmission', target));
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setBusy(false);
    }
  };

  const post = async (): Promise<void> => {
    // One submission per confirmation, however many times the button is pressed.
    if (summary === null || posting.current) {
      return;
    }
    posting.current = true;
    setBusy(true);
    try {
      const result = await callOperation('submitReview', { ...target, prepId: summary.prepId });
      replaceReview(result.review);
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      posting.current = false;
      setBusy(false);
      setSummary(null);
    }
  };

  const check = async (): Promise<void> => {
    if (latest === undefined) {
      return;
    }
    setChecking(true);
    try {
      const result = await callOperation('checkReviews', {
        ...target,
        attemptId: latest.attemptId,
      });
      replaceReview(result.review);
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className={styles.panel}>
      <button
        type="button"
        className={styles.primary}
        disabled={busy || nothingToSend || blocked}
        onClick={() => void prepare()}
      >
        Post review…
      </button>
      {nothingToSend && <p className={styles.hint}>Write a comment or an overall comment first.</p>}
      <Outcome attempt={latest} checking={checking} onCheck={() => void check()} />
      {error && (
        <p className={styles.failure} role="alert">
          {error}
        </p>
      )}
      {summary && (
        <ConfirmDialog
          summary={summary}
          posting={busy}
          onConfirm={() => void post()}
          onCancel={() => setSummary(null)}
        />
      )}
    </div>
  );
};
