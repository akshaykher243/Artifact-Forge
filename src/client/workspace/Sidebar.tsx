import { startTransition, useState } from 'react';
import type { JSX } from 'react';

import type { Comparison } from '../../shared/comparison.ts';
import { FileTree } from '../files/FileTree.tsx';
import type { PrContext } from '../pr/pr-context.ts';
import { PrSummary } from '../pr/PrSummary.tsx';
import { computeProgress } from './progress.ts';
import styles from './Sidebar.module.css';
import { filterFiles, useWorkspace } from './workspace-state.ts';

const RING_RADIUS = 7.5;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

interface ProgressRingProps {
  percent: number;
}

const ProgressRing = ({ percent }: ProgressRingProps): JSX.Element => (
  <span className={styles.ring}>
    <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
      <circle className={styles.ringTrack} cx="10" cy="10" r={RING_RADIUS} />
      <circle
        className={styles.ringValue}
        cx="10"
        cy="10"
        r={RING_RADIUS}
        strokeDasharray={`${((RING_CIRCUMFERENCE * percent) / 100).toFixed(1)} ${RING_CIRCUMFERENCE.toFixed(1)}`}
        transform="rotate(-90 10 10)"
      />
    </svg>
    <span>{percent}%</span>
  </span>
);

const ComparisonSummary = (): JSX.Element => {
  const { comparison, onChangeComparison, state } = useWorkspace();
  const additions = comparison.files.reduce((total, file) => total + file.additions, 0);
  const deletions = comparison.files.reduce((total, file) => total + file.deletions, 0);
  return (
    <div className={styles.summary}>
      {onChangeComparison && (
        <div className={styles.summaryRow}>
          <span className={styles.summaryRefs}>
            {comparison.base.name} ← {comparison.head.name}
          </span>
          <button type="button" className={styles.change} onClick={onChangeComparison}>
            Change
          </button>
        </div>
      )}
      <div className={styles.summaryNote}>
        {comparison.repo} · {comparison.files.length} files, +{additions} −{deletions}
      </div>
      {state.saveError && (
        <div className={styles.saveError} role="alert">
          {state.saveError}
        </div>
      )}
    </div>
  );
};

const ProgressRow = (): JSX.Element => {
  const { comparison, state, dispatch } = useWorkspace();
  const progress = computeProgress(comparison.files, state.reviewed);
  return (
    <div className={styles.progress}>
      <span className={styles.muted}>Remaining</span>
      <span className={styles.add}>+{progress.remainingAdditions}</span>
      <span className={styles.del}>−{progress.remainingDeletions}</span>
      <button
        type="button"
        className={state.compact ? `${styles.compact} ${styles.compactOn}` : styles.compact}
        aria-pressed={state.compact}
        onClick={() => dispatch({ type: 'toggleCompact' })}
      >
        Compact
      </button>
      <ProgressRing percent={progress.percent} />
    </div>
  );
};

const FilesHeader = (): JSX.Element => {
  const { comparison, state, dispatch } = useWorkspace();
  // The field echoes keystrokes at once; filtering 1,000 files runs as an interruptible transition.
  const [text, setText] = useState(state.filter);
  const total = comparison.files.length;
  const shown = filterFiles(comparison.files, state.filter).length;
  const count = state.filter.trim() === '' ? String(total) : `${shown} of ${total}`;
  return (
    <div className={styles.filesHeader}>
      <span className={styles.filesTitle}>Files, {count}</span>
      <input
        type="search"
        className={styles.filter}
        value={text}
        onChange={(event) => {
          const filter = event.target.value;
          setText(filter);
          startTransition(() => dispatch({ type: 'setFilter', filter }));
        }}
        placeholder="Filter files"
        aria-label="Filter files"
        spellCheck={false}
      />
    </div>
  );
};

export interface SidebarProps {
  onPrReloaded: (comparison: Comparison, pr: PrContext) => void;
}

export const Sidebar = ({ onPrReloaded }: SidebarProps): JSX.Element => {
  const { state, pr } = useWorkspace();
  return (
    <aside className={styles.sidebar} style={{ width: `${state.sidebarWidth}px` }}>
      {pr && (
        <div className={styles.summary}>
          <PrSummary pr={pr} onReloaded={onPrReloaded} />
        </div>
      )}
      <ComparisonSummary />
      <ProgressRow />
      <div className={styles.files}>
        <FilesHeader />
        <FileTree />
      </div>
    </aside>
  );
};
