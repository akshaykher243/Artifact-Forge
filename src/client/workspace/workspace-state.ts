import { createContext, useContext } from 'react';
import type { Dispatch } from 'react';

import type { ChangedFile, Comparison } from '../../shared/comparison.ts';
import type { MapLevel } from '../map/layout.ts';
import type { PrContext } from '../pr/pr-context.ts';

export const SIDEBAR_WIDTH = { min: 240, max: 760, initial: 360 } as const;
/** The artifact's right-hand drawer: 280 to 900 pixels, 520 by default. */
export const DRAWER_WIDTH = { min: 280, max: 900, initial: 520 } as const;
/** The artifact's Git panel on the left of the map. */
export const GIT_WIDTH = { min: 200, max: 560, initial: 300 } as const;
/** The artifact's zoom: 50% to 160% in steps of 15%. */
const ZOOM = { min: 0.5, max: 1.6, step: 0.15 } as const;

export type WorkspaceView = 'diff' | 'map';

export interface WorkspaceState {
  selectedPath: string | null;
  compact: boolean;
  closedDirs: ReadonlySet<string>;
  foldedSections: ReadonlySet<string>;
  reviewed: ReadonlySet<string>;
  sidebarWidth: number;
  drawerOpen: boolean;
  drawerWidth: number;
  /** Text typed into `Filter files`; empty shows every file. */
  filter: string;
  /** Shown in the sidebar when review progress could not be saved. */
  saveError: string | null;
  view: WorkspaceView;
  mapLevel: MapLevel;
  zoom: number;
  overlay: boolean;
  gitOpen: boolean;
  gitWidth: number;
  /** The selected map node: a folder, file path or function id, depending on the level. */
  mapSelection: string | null;
  mapDrawerWidth: number;
}

export type WorkspaceAction =
  | { type: 'selectFile'; path: string | null }
  | { type: 'toggleCompact' }
  | { type: 'toggleDir'; path: string }
  | { type: 'toggleSection'; path: string }
  | { type: 'unfoldSection'; path: string }
  | { type: 'setReviewed'; path: string; reviewed: boolean }
  | { type: 'replaceReviewed'; paths: readonly string[] }
  | { type: 'reviewSaveFailed'; path: string; reviewed: boolean }
  | { type: 'marksLoadFailed' }
  | { type: 'setSidebarWidth'; width: number }
  | { type: 'toggleDrawer' }
  | { type: 'openDrawer' }
  | { type: 'setDrawerWidth'; width: number }
  | { type: 'setFilter'; filter: string }
  /** A sidebar file pick: selects it in the diff, or at `Package` level in the map. */
  | { type: 'pickFile'; path: string }
  | { type: 'showView'; view: WorkspaceView }
  /** Shows one file alone in the Diff view. */
  | { type: 'openInDiff'; path: string }
  | { type: 'setMapLevel'; level: MapLevel }
  | { type: 'zoom'; by: 1 | -1 }
  | { type: 'resetZoom' }
  | { type: 'toggleOverlay' }
  | { type: 'toggleGit' }
  | { type: 'setGitWidth'; width: number }
  /** Selects a map node, or clears the selection when it is already selected. */
  | { type: 'toggleMapNode'; id: string }
  | { type: 'focusMapNode'; level: MapLevel; id: string }
  | { type: 'clearMapSelection' }
  | { type: 'setMapDrawerWidth'; width: number };

export const initialWorkspaceState: WorkspaceState = {
  selectedPath: null,
  compact: false,
  closedDirs: new Set(),
  foldedSections: new Set(),
  reviewed: new Set(),
  sidebarWidth: SIDEBAR_WIDTH.initial,
  drawerOpen: false,
  drawerWidth: DRAWER_WIDTH.initial,
  filter: '',
  saveError: null,
  view: 'diff',
  mapLevel: 'module',
  zoom: 1,
  overlay: true,
  gitOpen: true,
  gitWidth: GIT_WIDTH.initial,
  mapSelection: null,
  mapDrawerWidth: DRAWER_WIDTH.initial,
};

const REVIEW_SAVE_ERROR = 'Could not save review progress.';

const withMember = (
  set: ReadonlySet<string>,
  value: string,
  member: boolean,
): ReadonlySet<string> => {
  const next = new Set(set);
  if (member) {
    next.add(value);
  } else {
    next.delete(value);
  }
  return next;
};

const toggle = (set: ReadonlySet<string>, value: string): ReadonlySet<string> => {
  const next = new Set(set);
  if (next.has(value)) {
    next.delete(value);
  } else {
    next.add(value);
  }
  return next;
};

const clamp = (limits: { min: number; max: number }, width: number): number =>
  Math.max(limits.min, Math.min(limits.max, Math.round(width)));

export const clampSidebarWidth = (width: number): number => clamp(SIDEBAR_WIDTH, width);

/** One zoom step in or out, rounded to whole percents and kept within the limits. */
export const stepZoom = (zoom: number, by: 1 | -1): number =>
  Math.max(ZOOM.min, Math.min(ZOOM.max, Math.round((zoom + by * ZOOM.step) * 100) / 100));

const mapReducer = (state: WorkspaceState, action: WorkspaceAction): WorkspaceState => {
  switch (action.type) {
    case 'pickFile':
      return state.view === 'map'
        ? { ...state, mapLevel: 'package', mapSelection: action.path }
        : { ...state, selectedPath: action.path };
    case 'showView':
      return { ...state, view: action.view };
    case 'openInDiff':
      return { ...state, view: 'diff', selectedPath: action.path };
    case 'setMapLevel':
      return { ...state, mapLevel: action.level, mapSelection: null };
    case 'zoom':
      return { ...state, zoom: stepZoom(state.zoom, action.by) };
    case 'resetZoom':
      return { ...state, zoom: 1 };
    case 'toggleOverlay':
      return { ...state, overlay: !state.overlay };
    case 'toggleGit':
      return { ...state, gitOpen: !state.gitOpen };
    case 'setGitWidth':
      return { ...state, gitWidth: clamp(GIT_WIDTH, action.width) };
    case 'toggleMapNode':
      return { ...state, mapSelection: state.mapSelection === action.id ? null : action.id };
    case 'focusMapNode':
      return { ...state, mapLevel: action.level, mapSelection: action.id };
    case 'clearMapSelection':
      return { ...state, mapSelection: null };
    case 'setMapDrawerWidth':
      return { ...state, mapDrawerWidth: clamp(DRAWER_WIDTH, action.width) };
    default:
      return state;
  }
};

export const workspaceReducer = (
  state: WorkspaceState,
  action: WorkspaceAction,
): WorkspaceState => {
  switch (action.type) {
    case 'selectFile':
      return { ...state, selectedPath: action.path };
    case 'toggleCompact':
      return { ...state, compact: !state.compact };
    case 'toggleDir':
      return { ...state, closedDirs: toggle(state.closedDirs, action.path) };
    case 'toggleSection':
      return { ...state, foldedSections: toggle(state.foldedSections, action.path) };
    case 'unfoldSection':
      return { ...state, foldedSections: withMember(state.foldedSections, action.path, false) };
    case 'setReviewed':
      return { ...state, reviewed: withMember(state.reviewed, action.path, action.reviewed) };
    case 'replaceReviewed':
      return { ...state, reviewed: new Set(action.paths), saveError: null };
    case 'marksLoadFailed':
      return { ...state, saveError: 'Could not load review progress.' };
    case 'reviewSaveFailed':
      return {
        ...state,
        reviewed: withMember(state.reviewed, action.path, !action.reviewed),
        saveError: REVIEW_SAVE_ERROR,
      };
    case 'setSidebarWidth':
      return { ...state, sidebarWidth: clampSidebarWidth(action.width) };
    case 'toggleDrawer':
      return { ...state, drawerOpen: !state.drawerOpen };
    case 'openDrawer':
      return { ...state, drawerOpen: true };
    case 'setDrawerWidth':
      return { ...state, drawerWidth: clamp(DRAWER_WIDTH, action.width) };
    case 'setFilter':
      return { ...state, filter: action.filter };
    default:
      return mapReducer(state, action);
  }
};

/** Changed files whose path contains the filter text, ignoring case. */
export const filterFiles = (files: readonly ChangedFile[], filter: string): ChangedFile[] => {
  const needle = filter.trim().toLowerCase();
  return needle === ''
    ? [...files]
    : files.filter((file) => file.path.toLowerCase().includes(needle));
};

export interface WorkspaceContextValue {
  comparison: Comparison;
  /** Returns to base and head selection; null when the comparison cannot be changed (sample data). */
  onChangeComparison: (() => void) | null;
  /** The pull request being reviewed, if any. */
  pr: PrContext | null;
  state: WorkspaceState;
  dispatch: Dispatch<WorkspaceAction>;
  /** Marks a file reviewed or not, everywhere, and saves it for this comparison. */
  setReviewed: (path: string, reviewed: boolean) => void;
}

export const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export type WorkspaceActions = Pick<WorkspaceContextValue, 'dispatch' | 'setReviewed'>;

/**
 * The stable half of the workspace: components that only act (sections, tree rows) read this,
 * so they are not re-rendered by every state change and can be memoised on their own props.
 */
export const WorkspaceActionsContext = createContext<WorkspaceActions | null>(null);

export const useWorkspaceActions = (): WorkspaceActions => {
  const value = useContext(WorkspaceActionsContext);
  if (value === null) {
    throw new Error('useWorkspaceActions must be used inside the Workspace component');
  }
  return value;
};

export const useWorkspace = (): WorkspaceContextValue => {
  const value = useContext(WorkspaceContext);
  if (value === null) {
    throw new Error('useWorkspace must be used inside the Workspace component');
  }
  return value;
};
