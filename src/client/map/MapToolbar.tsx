import type { JSX } from 'react';

import { useWorkspace } from '../workspace/workspace-state.ts';
import { MAP_LEVELS } from './layout.ts';
import styles from './MapView.module.css';

export interface MapToolbarProps {
  /** `<n> changed functions`, or empty while there is no map. */
  note: string;
}

/** The artifact's map toolbar without the path lens: levels, zoom, overlay and the Git toggle. */
export const MapToolbar = ({ note }: MapToolbarProps): JSX.Element => {
  const { state, dispatch } = useWorkspace();
  const zoomLabel = `${Math.round(state.zoom * 100)}%`;
  return (
    <div className={styles.toolbar}>
      <span className={styles.levels}>
        {MAP_LEVELS.map(([level, label]) => (
          <button
            key={level}
            type="button"
            className={
              state.mapLevel === level ? `${styles.level} ${styles.levelOn}` : styles.level
            }
            aria-pressed={state.mapLevel === level}
            onClick={() => dispatch({ type: 'setMapLevel', level })}
          >
            {label}
          </button>
        ))}
      </span>
      <span className={styles.zoom}>
        <button
          type="button"
          className={styles.square}
          aria-label="Zoom out"
          onClick={() => dispatch({ type: 'zoom', by: -1 })}
        >
          −
        </button>
        <button
          type="button"
          className={styles.zoomReset}
          aria-label={`Reset zoom, ${zoomLabel}`}
          onClick={() => dispatch({ type: 'resetZoom' })}
        >
          {zoomLabel}
        </button>
        <button
          type="button"
          className={styles.square}
          aria-label="Zoom in"
          onClick={() => dispatch({ type: 'zoom', by: 1 })}
        >
          +
        </button>
      </span>
      <button
        type="button"
        className={state.overlay ? `${styles.toggle} ${styles.overlayOn}` : styles.toggle}
        aria-pressed={state.overlay}
        onClick={() => dispatch({ type: 'toggleOverlay' })}
      >
        Diff overlay
      </button>
      <button
        type="button"
        className={state.gitOpen ? `${styles.toggle} ${styles.gitOn}` : styles.toggle}
        aria-pressed={state.gitOpen}
        onClick={() => dispatch({ type: 'toggleGit' })}
      >
        Git
      </button>
      <span className={styles.note}>{note}</span>
    </div>
  );
};
