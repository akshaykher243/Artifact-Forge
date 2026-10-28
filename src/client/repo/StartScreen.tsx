import { useEffect, useState } from 'react';
import type { JSX } from 'react';

import type { Comparison } from '../../shared/comparison.ts';
import type { OpenedRepository, RefList } from '../../shared/repository.ts';
import { callOperation, OperationError } from '../app/api.ts';
import { PrPicker } from '../pr/PrPicker.tsx';
import type { PrContext } from '../pr/pr-context.ts';
import { ComparePicker } from './ComparePicker.tsx';
import { RepoPicker } from './RepoPicker.tsx';
import type { PendingPullRequest } from './RepoPicker.tsx';
import styles from './StartScreen.module.css';

type RefsState =
  { state: 'loading' } | { state: 'ready'; refs: RefList } | { state: 'failed'; message: string };

const describeRefs = (refs: RefList): string =>
  `${refs.branches.length} branches · ${refs.remoteBranches.length} remote branches · ${refs.tags.length} tags`;

const refsMessage = (refs: RefsState): string => {
  if (refs.state === 'ready') {
    return describeRefs(refs.refs);
  }
  return refs.state === 'failed' ? refs.message : 'Reading refs…';
};

interface OpenedRepositoryPanelProps {
  repository: OpenedRepository;
  pending: PendingPullRequest | null;
  onChange: () => void;
  onCompared: (comparison: Comparison, pr: PrContext | null) => void;
}

const OpenedRepositoryPanel = ({
  repository,
  pending,
  onChange,
  onCompared,
}: OpenedRepositoryPanelProps): JSX.Element => {
  const [refs, setRefs] = useState<RefsState>({ state: 'loading' });

  useEffect(() => {
    const load = async (): Promise<void> => {
      try {
        setRefs({
          state: 'ready',
          refs: await callOperation('listRefs', { repo: repository.path }),
        });
      } catch (error) {
        const message = error instanceof OperationError ? error.message : 'Could not read refs.';
        setRefs({ state: 'failed', message });
      }
    };
    void load();
  }, [repository.path]);

  return (
    <>
      <div className={styles.opened}>
        <div className={styles.openedHeader}>
          <span className={styles.repoName}>{repository.name}</span>
          <button type="button" className={styles.change} onClick={onChange}>
            Change
          </button>
        </div>
        <span className={styles.repoPath} title={repository.path}>
          {repository.path}
        </span>
        <p className={styles.refs} role="status">
          {refsMessage(refs)}
        </p>
      </div>
      {refs.state === 'ready' && (
        <>
          <PrPicker
            repository={repository}
            remotes={refs.refs.remotes}
            autoStart={pending}
            onLoaded={onCompared}
          />
          <ComparePicker
            repository={repository}
            refs={refs.refs}
            onCompared={(comparison) => onCompared(comparison, null)}
          />
        </>
      )}
    </>
  );
};

export interface StartScreenProps {
  roots: readonly string[];
  initialRepository: OpenedRepository | null;
  onCompared: (repository: OpenedRepository, comparison: Comparison, pr: PrContext | null) => void;
}

/** Shown until a comparison exists: choose a repository, then its base and head. */
export const StartScreen = ({
  roots,
  initialRepository,
  onCompared,
}: StartScreenProps): JSX.Element => {
  const [repository, setRepository] = useState<OpenedRepository | null>(initialRepository);
  const [pending, setPending] = useState<PendingPullRequest | null>(null);

  return (
    <div className={styles.screen}>
      <aside className={styles.sidebar}>
        {repository ? (
          <OpenedRepositoryPanel
            repository={repository}
            pending={pending}
            onChange={() => {
              setPending(null);
              setRepository(null);
            }}
            onCompared={(comparison, pr) => onCompared(repository, comparison, pr)}
          />
        ) : (
          <RepoPicker
            roots={roots}
            onOpened={(opened, pr) => {
              setPending(pr);
              setRepository(opened);
            }}
          />
        )}
      </aside>
      <main className={styles.main}>
        <div className={styles.header}>
          <span className={styles.crumb}>ArtifactForge</span>
          <h1 className={styles.heading}>{repository ? repository.name : 'Open a repository'}</h1>
        </div>
      </main>
    </div>
  );
};
