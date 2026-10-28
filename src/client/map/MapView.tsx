import { useCallback, useMemo } from 'react';
import type { JSX } from 'react';

import { FileStatus } from '../../shared/comparison.ts';
import type { ChangedFile } from '../../shared/comparison.ts';
import { isSourcePath, MAP_SOURCE_LIMIT } from '../../shared/map.ts';
import { Resizer } from '../ui/Resizer.tsx';
import { DRAWER_WIDTH, GIT_WIDTH, useWorkspace } from '../workspace/workspace-state.ts';
import { GitPanel } from './GitPanel.tsx';
import { layoutMap } from './layout.ts';
import type { MapInput } from './layout.ts';
import { MapCanvas } from './MapCanvas.tsx';
import { MapDrawer } from './MapDrawer.tsx';
import { MapToolbar } from './MapToolbar.tsx';
import styles from './MapView.module.css';
import { resolveSelection } from './selection.ts';
import type { MapEntry } from './use-dependency-map.ts';

const count = (n: number): string => n.toLocaleString('en');

const analysedFileCount = (files: readonly ChangedFile[]): number =>
  files.filter(
    (file) => file.status !== FileStatus.deleted && !file.binary && isSourcePath(file.path),
  ).length;

interface Shown {
  input: MapInput;
  /** Why the map is not drawn in full; null when it is. */
  message: string | null;
}

/** The map model to draw for this entry: the changed files alone until the analysis is in. */
const shownFor = (entry: MapEntry, files: readonly ChangedFile[]): Shown => {
  const filesOnly = { files, functions: [], edges: [] };
  if (entry.state === 'error') {
    return { input: { ...filesOnly, files: [] }, message: entry.message };
  }
  if (entry.state !== 'loaded') {
    return { input: filesOnly, message: `Analysing ${count(analysedFileCount(files))} files…` };
  }
  const { map } = entry;
  switch (map.state) {
    case 'ready':
      return { input: { files, functions: map.functions, edges: map.edges }, message: null };
    case 'noSource':
      return { input: filesOnly, message: 'No TypeScript or JavaScript changes to map.' };
    case 'tooLarge':
      return {
        input: filesOnly,
        message: `Repository too large for the map (${count(map.sourceFileCount)} source files; the limit is ${count(MAP_SOURCE_LIMIT)}).`,
      };
    case 'failed':
      return { input: { ...filesOnly, files: [] }, message: map.message };
  }
};

export interface MapViewProps {
  entry: MapEntry;
}

/** The artifact's Map: toolbar, Git panel, canvas and detail drawer. */
export const MapView = ({ entry }: MapViewProps): JSX.Element => {
  const { comparison, state, dispatch } = useWorkspace();
  const shown = useMemo(() => shownFor(entry, comparison.files), [entry, comparison.files]);
  const { mapLevel: level, overlay, mapSelection, reviewed } = state;
  const layout = useMemo(
    () =>
      layoutMap(shown.input, { level, overlay, selectedId: mapSelection, reviewedFiles: reviewed }),
    [shown.input, level, overlay, mapSelection, reviewed],
  );
  const selection = useMemo(
    () => resolveSelection(shown.input, level, mapSelection),
    [shown.input, level, mapSelection],
  );
  const pick = useCallback((id: string) => dispatch({ type: 'toggleMapNode', id }), [dispatch]);
  const changed = shown.input.functions.filter((fn) => fn.change !== null).length;
  const note =
    entry.state === 'loaded' && shown.message === null ? `${changed} changed functions` : '';

  return (
    <div className={styles.map}>
      <MapToolbar note={note} />
      <div className={styles.body}>
        {state.gitOpen && (
          <>
            <GitPanel />
            <Resizer
              label="Resize Git panel"
              tone="dark"
              width={state.gitWidth}
              direction={1}
              onResize={(width) => dispatch({ type: 'setGitWidth', width })}
              onReset={() => dispatch({ type: 'setGitWidth', width: GIT_WIDTH.initial })}
            />
          </>
        )}
        <MapCanvas layout={layout} zoom={state.zoom} onPick={pick} message={shown.message} />
        {selection !== null && (
          <>
            <Resizer
              label="Resize code panel"
              tone="dark"
              width={state.mapDrawerWidth}
              direction={-1}
              onResize={(width) => dispatch({ type: 'setMapDrawerWidth', width })}
              onReset={() => dispatch({ type: 'setMapDrawerWidth', width: DRAWER_WIDTH.initial })}
            />
            <MapDrawer selection={selection} />
          </>
        )}
      </div>
    </div>
  );
};
