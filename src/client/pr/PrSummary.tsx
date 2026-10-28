import { useState } from 'react';
import type { JSX } from 'react';

import type { Comparison } from '../../shared/comparison.ts';
import { callOperation, OperationError } from '../app/api.ts';
import { useWorkspace } from '../workspace/workspace-state.ts';
import { loadPullRequest } from './load-pull-request.ts';
import type { PrContext } from './pr-context.ts';
import styles from './PrSummary.module.css';

const STATE_LABEL = { OPEN: 'Open', CLOSED: 'Closed', MERGED: 'Merged' } as const;

export interface PrSummaryProps {
  pr: PrContext;
  onReloaded: (comparison: Comparison, pr: PrContext) => void;
}

/** `acme/platform #42`, its state, title, branches and head commit, with a way to fetch new commits. */
export const PrSummary = ({ pr, onReloaded }: PrSummaryProps): JSX.Element => {
  const { comparison } = useWorkspace();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { ref, details } = pr;

  const refresh = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      const status = await callOperation('ghStatus', {});
      const loaded = await loadPullRequest(
        {
          repoPath: pr.repoPath,
          remote: pr.remote,
          owner: ref.owner,
          name: ref.name,
          number: ref.number,
        },
        status,
      );
      onReloaded(loaded.comparison, loaded.pr);
    } catch (failure) {
      setError(
        failure instanceof OperationError ? failure.message : 'Could not fetch the pull request.',
      );
      setBusy(false);
    }
  };

  return (
    <section className={styles.summary} aria-label="Pull request">
      <div className={styles.row}>
        <span className={styles.name}>
          {ref.owner}/{ref.name} #{ref.number}
        </span>
        {details && (
          <span className={`${styles.state} ${styles[details.state] ?? ''}`}>
            {STATE_LABEL[details.state]}
          </span>
        )}
        <button
          type="button"
          className={styles.refresh}
          disabled={busy}
          onClick={() => void refresh()}
        >
          {busy ? 'Fetching…' : 'Refresh'}
        </button>
      </div>
      {details && <span className={styles.title}>{details.title}</span>}
      <span className={styles.refs}>
        {comparison.base.name} ← {comparison.head.name} · {comparison.head.sha.slice(0, 7)}
      </span>
      {error && (
        <span className={styles.error} role="alert">
          {error}
        </span>
      )}
    </section>
  );
};
