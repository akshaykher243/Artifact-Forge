import { useEffect, useState } from 'react';
import type { FormEvent, JSX } from 'react';

import { readPrLink } from '../../shared/pull-request.ts';
import type { PrRef } from '../../shared/pull-request.ts';
import type { FoundClone, OpenedRepository, RecentRepository } from '../../shared/repository.ts';
import { callOperation, OperationError } from '../app/api.ts';
import styles from './RepoPicker.module.css';

/** A pull request to start reviewing as soon as its repository is open. */
export interface PendingPullRequest {
  remote: string;
  number: number;
}

export interface RepoPickerProps {
  roots: readonly string[];
  onOpened: (repository: OpenedRepository, pending: PendingPullRequest | null) => void;
}

const messageOf = (error: unknown): string =>
  error instanceof OperationError ? error.message : 'Could not open that repository.';

const NOT_A_PR_LINK =
  'Enter a folder path or a GitHub pull request link, such as https://github.com/owner/repo/pull/42.';

interface CloneChoice {
  pr: PrRef;
  clones: FoundClone[];
}

export const RepoPicker = ({ roots, onOpened }: RepoPickerProps): JSX.Element => {
  const [path, setPath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [choice, setChoice] = useState<CloneChoice | null>(null);
  const [recents, setRecents] = useState<RecentRepository[]>([]);
  const [recentsFailed, setRecentsFailed] = useState(false);
  const busy = progress !== null;

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        setRecents((await callOperation('recentRepos', {})).repos);
      } catch {
        // Recents are a convenience; the path field still works without them.
        setRecentsFailed(true);
      }
    };
    void load();
  }, []); // Runs once: recents are read when the picker first appears.

  const open = async (target: string, pending: PendingPullRequest | null): Promise<void> => {
    setProgress('Opening…');
    setError(null);
    try {
      onOpened(await callOperation('openRepo', { path: target }), pending);
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setProgress(null);
    }
  };

  const openFromLink = async (pr: PrRef): Promise<void> => {
    setError(null);
    setChoice(null);
    setProgress(`Looking for a local clone of ${pr.owner}/${pr.name}…`);
    try {
      const { clones } = await callOperation('findClones', { owner: pr.owner, name: pr.name });
      setProgress(null);
      const [only] = clones;
      if (clones.length === 1 && only !== undefined) {
        await open(only.path, { remote: only.remote, number: pr.number });
      } else if (clones.length > 1) {
        setChoice({ pr, clones });
      } else {
        setError(
          `No local clone of ${pr.owner}/${pr.name} was found inside ${roots.join(', ')}. ` +
            `Clone it there with git clone git@github.com:${pr.owner}/${pr.name}.git, or open it by path.`,
        );
      }
    } catch (failure) {
      setProgress(null);
      setError(messageOf(failure));
    }
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const reading = readPrLink(path);
    if (reading.kind === 'pullRequest') {
      void openFromLink(reading.pr);
    } else if (reading.kind === 'otherLink') {
      setChoice(null);
      setError(NOT_A_PR_LINK);
    } else {
      setChoice(null);
      void open(path, null);
    }
  };

  return (
    <div className={styles.picker}>
      <form className={styles.form} onSubmit={handleSubmit}>
        <label className={styles.label} htmlFor="repository-path">
          Repository path or pull request link
        </label>
        <div className={styles.row}>
          <input
            id="repository-path"
            className={styles.input}
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder="~/code/app or a github.com …/pull/42 link"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" className={styles.open} disabled={busy || path.trim() === ''}>
            Open
          </button>
        </div>
        <p className={styles.hint}>Repositories must be inside {roots.join(', ')}</p>
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
        {recentsFailed && <p className={styles.hint}>Recent repositories could not be read.</p>}
      </form>
      {choice && (
        <section className={styles.recents} aria-label="Choose a clone">
          <h2 className={styles.recentsTitle}>
            {choice.clones.length} clones of {choice.pr.owner}/{choice.pr.name}: choose one for #
            {choice.pr.number}
          </h2>
          {choice.clones.map((clone) => (
            <button
              key={clone.path}
              type="button"
              className={styles.recent}
              title={clone.path}
              disabled={busy}
              onClick={() =>
                void open(clone.path, { remote: clone.remote, number: choice.pr.number })
              }
            >
              <span className={styles.recentName}>{clone.name}</span>
              <span className={styles.recentPath}>
                {clone.path} · {clone.remote}
              </span>
            </button>
          ))}
        </section>
      )}
      {recents.length > 0 && (
        <section className={styles.recents} aria-label="Recent repositories">
          <h2 className={styles.recentsTitle}>Recent</h2>
          {recents.map((recent) => (
            <button
              key={recent.path}
              type="button"
              className={styles.recent}
              title={recent.path}
              disabled={busy}
              onClick={() => void open(recent.path, null)}
            >
              <span className={styles.recentName}>{recent.name}</span>
              <span className={styles.recentPath}>{recent.path}</span>
            </button>
          ))}
        </section>
      )}
    </div>
  );
};
