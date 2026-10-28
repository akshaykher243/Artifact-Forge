import type { JSX } from 'react';

import { useWorkspace } from '../workspace/workspace-state.ts';
import styles from './MapView.module.css';

const SHORT_SHA = 7;

/**
 * The artifact's Git panel: the one span of history this comparison covers, head over base.
 * The artifact's history links are left out; they only toggled the overlay and the view.
 */
export const GitPanel = (): JSX.Element => {
  const { comparison, state } = useWorkspace();
  const { head, base } = comparison;
  return (
    <div
      role="region"
      className={styles.git}
      style={{ flexBasis: `${state.gitWidth}px`, width: `${state.gitWidth}px` }}
      aria-label="Git"
    >
      <div className={styles.gitTitle}>GIT</div>
      <div className={styles.gitNote}>
        Showing all of <span className={styles.gitInk}>{head.name}</span>, the reference is{' '}
        <span className={styles.gitInk}>ref:{base.name}</span>
      </div>
      <div className={styles.gitCard}>
        <div className={styles.gitCommit}>
          <span className={styles.gitSha}>{head.sha.slice(0, SHORT_SHA)}</span>
          <span className={styles.gitName}>{head.name}</span>
        </div>
      </div>
      <div className={`${styles.gitCommit} ${styles.gitBase}`}>
        <span className={styles.gitSha}>{base.sha.slice(0, SHORT_SHA)}</span>
        <span className={styles.gitSha}>{base.name}, reference</span>
      </div>
    </div>
  );
};
