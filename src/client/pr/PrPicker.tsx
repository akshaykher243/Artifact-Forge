import { useEffect, useRef, useState } from 'react';
import type { FormEvent, JSX } from 'react';

import type { Comparison } from '../../shared/comparison.ts';
import type { GhStatus } from '../../shared/pull-request.ts';
import type { OpenedRepository, RemoteSummary } from '../../shared/repository.ts';
import { callOperation, OperationError } from '../app/api.ts';
import styles from '../repo/RepoPicker.module.css';
import type { PendingPullRequest } from '../repo/RepoPicker.tsx';
import { loadPullRequest } from './load-pull-request.ts';
import type { PrContext } from './pr-context.ts';

const describeStatus = (status: GhStatus | null): string => {
  if (status === null) {
    return 'Checking the GitHub CLI…';
  }
  if (!status.installed) {
    return 'The GitHub CLI (gh) is required to post reviews. You can still review.';
  }
  if (!status.signedIn) {
    return 'gh is not signed in. Run gh auth login in a terminal to post reviews.';
  }
  return `Signed in to GitHub as ${status.login ?? 'an unknown account'}.`;
};

export interface PrPickerProps {
  repository: OpenedRepository;
  remotes: readonly RemoteSummary[];
  /** Starts this pull request at once, e.g. when the app was given its link. */
  autoStart: PendingPullRequest | null;
  onLoaded: (comparison: Comparison, pr: PrContext) => void;
}

export const PrPicker = ({
  repository,
  remotes,
  autoStart,
  onLoaded,
}: PrPickerProps): JSX.Element | null => {
  const github = remotes.filter((remote) => remote.github !== null);
  const [remote, setRemote] = useState(
    autoStart?.remote ??
      github.find((candidate) => candidate.name === 'origin')?.name ??
      github[0]?.name ??
      '',
  );
  const [number, setNumber] = useState(autoStart === null ? '' : String(autoStart.number));
  const autoStarted = useRef(false);
  const [status, setStatus] = useState<GhStatus | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const check = async (): Promise<void> => {
      try {
        setStatus(await callOperation('ghStatus', {}));
      } catch {
        setStatus({ installed: false, signedIn: false, login: null });
      }
    };
    void check();
  }, []); // Runs once: gh's sign-in state is read when the picker appears.

  const start = async (remoteName: string, prNumber: number): Promise<void> => {
    const target = github.find((candidate) => candidate.name === remoteName);
    if (target === undefined || target.github === null) {
      return;
    }
    setError(null);
    setProgress(`Fetching pull request #${prNumber} over SSH…`);
    try {
      const loaded = await loadPullRequest(
        {
          repoPath: repository.path,
          remote: remoteName,
          owner: target.github.owner,
          name: target.github.name,
          number: prNumber,
        },
        // A submit before the sign-in check finished waits for it rather than skipping gh.
        status ?? (await callOperation('ghStatus', {})),
      );
      onLoaded(loaded.comparison, loaded.pr);
    } catch (failure) {
      setError(
        failure instanceof OperationError ? failure.message : 'Could not load that pull request.',
      );
      setProgress(null);
    }
  };

  // The ref keeps this to one run, though `start` is a new function on every render.
  useEffect(() => {
    if (autoStart !== null && !autoStarted.current) {
      autoStarted.current = true;
      void start(autoStart.remote, autoStart.number);
    }
  });

  if (github.length === 0) {
    return null;
  }
  const valid = /^[1-9]\d{0,9}$/.test(number.trim());

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (valid) {
      void start(remote, Number(number.trim()));
    }
  };

  return (
    <form className={styles.form} onSubmit={handleSubmit} aria-label="Pull request">
      <span className={styles.label}>Pull request</span>
      <div className={styles.row}>
        <select
          className={styles.input}
          aria-label="Remote"
          value={remote}
          onChange={(event) => setRemote(event.target.value)}
        >
          {github.map((candidate) => (
            <option key={candidate.name} value={candidate.name}>
              {candidate.name} · {candidate.github?.owner}/{candidate.github?.name}
            </option>
          ))}
        </select>
        <input
          className={styles.input}
          aria-label="Pull request number"
          inputMode="numeric"
          placeholder="#"
          value={number}
          onChange={(event) => setNumber(event.target.value)}
        />
      </div>
      <div className={styles.row}>
        <button type="submit" className={styles.open} disabled={!valid || progress !== null}>
          Review pull request
        </button>
      </div>
      <p className={styles.hint}>{describeStatus(status)}</p>
      {progress && (
        <p className={styles.hint} aria-live="polite">
          {progress}
        </p>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </form>
  );
};
