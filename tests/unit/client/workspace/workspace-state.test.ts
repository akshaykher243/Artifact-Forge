import { describe, expect, it } from 'vitest';

import {
  initialWorkspaceState,
  stepZoom,
  workspaceReducer,
} from '../../../../src/client/workspace/workspace-state.ts';
import type { WorkspaceState } from '../../../../src/client/workspace/workspace-state.ts';

const inMap: WorkspaceState = { ...initialWorkspaceState, view: 'map' };

describe('stepZoom', () => {
  it('Zoom limits: nine presses in from 100% stop at 160%', () => {
    let zoom = 1;
    for (let press = 0; press < 9; press += 1) {
      zoom = stepZoom(zoom, 1);
    }

    expect(zoom).toBe(1.6);
  });

  it('steps out by 15% and stops at 50%', () => {
    expect([stepZoom(1, -1), stepZoom(0.55, -1), stepZoom(0.5, -1)]).toEqual([0.85, 0.5, 0.5]);
  });
});

describe('workspaceReducer in the map', () => {
  it('a sidebar pick in the Map view selects the file at Package level', () => {
    const next = workspaceReducer(inMap, { type: 'pickFile', path: 'src/lib/money.ts' });

    expect([next.mapLevel, next.mapSelection, next.selectedPath]).toEqual([
      'package',
      'src/lib/money.ts',
      null,
    ]);
  });

  it('a sidebar pick in the Diff view selects the file in the diff', () => {
    const next = workspaceReducer(initialWorkspaceState, { type: 'pickFile', path: 'a.ts' });

    expect([next.selectedPath, next.mapSelection]).toEqual(['a.ts', null]);
  });

  it('Change level: clears the selection', () => {
    const selected = workspaceReducer(inMap, { type: 'toggleMapNode', id: 'x' });

    const next = workspaceReducer(selected, { type: 'setMapLevel', level: 'package' });

    expect([next.mapLevel, next.mapSelection]).toEqual(['package', null]);
  });

  it('selecting a selected node clears it', () => {
    const once = workspaceReducer(inMap, { type: 'toggleMapNode', id: 'x' });

    expect(workspaceReducer(once, { type: 'toggleMapNode', id: 'x' }).mapSelection).toBeNull();
  });

  it('From map to diff: opens the file alone in the Diff view', () => {
    const next = workspaceReducer(inMap, { type: 'openInDiff', path: 'src/lib/money.ts' });

    expect([next.view, next.selectedPath]).toEqual(['diff', 'src/lib/money.ts']);
  });

  it('keeps the Git panel and drawer within their widths', () => {
    const narrow = workspaceReducer(inMap, { type: 'setGitWidth', width: 10 });
    const wide = workspaceReducer(inMap, { type: 'setMapDrawerWidth', width: 5000 });

    expect([narrow.gitWidth, wide.mapDrawerWidth]).toEqual([200, 900]);
  });
});
