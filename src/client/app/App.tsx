import { useEffect, useState } from 'react';
import type { JSX } from 'react';

import type { Comparison } from '../../shared/comparison.ts';
import type { OpenedRepository } from '../../shared/repository.ts';
import type { PrContext } from '../pr/pr-context.ts';
import { StartScreen } from '../repo/StartScreen.tsx';
import { Workspace } from '../workspace/Workspace.tsx';
import { callOperation, OperationError } from './api.ts';
import styles from './App.module.css';

type Screen =
  | { state: 'loading' }
  | { state: 'failed'; message: string }
  | { state: 'start'; repository: OpenedRepository | null }
  | {
      state: 'review';
      comparison: Comparison;
      repository: OpenedRepository | null;
      pr: PrContext | null;
    };

interface Startup {
  roots: string[];
  screen: Screen;
}

const loadStartup = async (): Promise<Startup> => {
  const { fixture, roots } = await callOperation('appInfo', {});
  if (fixture === null) {
    return { roots, screen: { state: 'start', repository: null } };
  }
  const comparison = await callOperation('compare', { source: 'fixture' });
  return { roots, screen: { state: 'review', comparison, repository: null, pr: null } };
};

export const App = (): JSX.Element => {
  const [roots, setRoots] = useState<string[]>([]);
  const [screen, setScreen] = useState<Screen>({ state: 'loading' });

  useEffect(() => {
    const run = async (): Promise<void> => {
      try {
        const startup = await loadStartup();
        setRoots(startup.roots);
        setScreen(startup.screen);
      } catch (error) {
        const message = error instanceof OperationError ? error.message : 'Unexpected error.';
        setScreen({ state: 'failed', message });
      }
    };
    void run();
  }, []); // Runs once: start-up belongs to page load, not to any state.

  if (screen.state === 'review') {
    const { repository } = screen;
    return (
      <Workspace
        key={screen.comparison.id}
        comparison={screen.comparison}
        pr={screen.pr}
        onPrReloaded={(comparison, pr) => setScreen({ ...screen, comparison, pr })}
        onChangeComparison={
          repository === null ? null : () => setScreen({ state: 'start', repository })
        }
      />
    );
  }
  if (screen.state === 'start') {
    return (
      <StartScreen
        roots={roots}
        initialRepository={screen.repository}
        onCompared={(repository, comparison, pr) =>
          setScreen({ state: 'review', comparison, repository, pr })
        }
      />
    );
  }
  return (
    <main className={styles.shell}>
      <h1 className={styles.title}>ArtifactForge</h1>
      <p role="status">{screen.state === 'failed' ? screen.message : 'Connecting…'}</p>
    </main>
  );
};
