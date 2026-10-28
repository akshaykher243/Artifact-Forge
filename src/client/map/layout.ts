/**
 * Ported from the prflow artifact's `mapVals`: the same packing, sizes and edge routing, given
 * the map model instead of the artifact's paths. Colours became tones, which map to the same
 * colour values in styles/tokens.css.
 */
import { FileStatus } from '../../shared/comparison.ts';
import type { ChangedFile } from '../../shared/comparison.ts';
import type { MapEdge, MapFunction } from '../../shared/map.ts';

export type MapLevel = 'arch' | 'package' | 'module' | 'code';

export const MAP_LEVELS: ReadonlyArray<[MapLevel, string]> = [
  ['arch', 'Architecture'],
  ['package', 'Package'],
  ['module', 'Module'],
  ['code', 'Code'],
];

/** `added` is green, `changed` amber, `plain` grey; with the overlay off everything is `plain`. */
export type NodeTone = 'added' | 'changed' | 'plain';

export interface MapBox {
  left: number;
  top: number;
  width: number;
  height: number;
  label: string;
  kind: 'directory' | 'file';
  touched: boolean;
}

export interface MapNode {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
  label: string;
  sub: string;
  title: string;
  add: string;
  del: string;
  mark: string;
  tone: NodeTone;
  selected: boolean;
  preview: Array<{ text: string; sign: '+' | '-' }>;
}

export interface MapLine {
  left: number;
  top: number;
  width: number;
  height: number;
  path: string;
  endX: number;
  endY: number;
}

export interface MapLayout {
  boxes: MapBox[];
  nodes: MapNode[];
  edges: MapLine[];
  width: number;
  height: number;
}

export interface MapView {
  level: MapLevel;
  overlay: boolean;
  selectedId: string | null;
  reviewedFiles: ReadonlySet<string>;
}

export interface MapInput {
  files: readonly ChangedFile[];
  functions: readonly MapFunction[];
  edges: readonly MapEdge[];
}

interface FileEntry {
  p: string;
  added: boolean;
  a: number;
  r: number;
  fns: Array<MapFunction & { order: number }>;
}

interface DirEntry {
  name: string;
  files: FileEntry[];
  maxDepth: number;
  first: number;
  a: number;
  r: number;
  nfn: number;
  col: number;
  slot: number;
  y0: number;
}

const NODE_WIDTH = 200;
const DIR_WIDTH = 244;
const GAP_X = 64;
const COLUMN_LIMIT = 1400;
const NO_FUNCTIONS = 1e9;

export const dirOf = (path: string): string =>
  path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '(root)';
const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);
const round1 = (value: number): number => Math.round(value * 10) / 10;

export const kindOf = (change: MapFunction['change']): string => {
  if (change === 'added') {
    return 'new function';
  }
  if (change === 'signature') {
    return 'signature changed';
  }
  return change === 'body' ? 'body changed' : 'unchanged';
};

const toneOf = (overlay: boolean, change: 'added' | 'body' | 'signature' | null): NodeTone => {
  if (!overlay || change === null) {
    return 'plain';
  }
  return change === 'added' ? 'added' : 'changed';
};

/** Files and folders as the artifact grouped them, with folders ordered and placed in columns. */
const groupDirectories = (input: MapInput, heightOf: (dir: DirEntry) => number): DirEntry[] => {
  const files = new Map<string, FileEntry>();
  const fileFor = (path: string): FileEntry => {
    const existing = files.get(path);
    if (existing !== undefined) {
      return existing;
    }
    const created: FileEntry = { p: path, added: false, a: 0, r: 0, fns: [] };
    files.set(path, created);
    return created;
  };
  for (const file of input.files) {
    Object.assign(fileFor(file.path), {
      added: file.status === FileStatus.added,
      a: file.additions,
      r: file.deletions,
    });
  }
  input.functions.forEach((fn, order) => fileFor(fn.file).fns.push({ ...fn, order }));
  const dirs = new Map<string, DirEntry>();
  for (const file of files.values()) {
    const name = dirOf(file.p);
    const dir = dirs.get(name) ?? {
      name,
      files: [],
      maxDepth: 0,
      first: NO_FUNCTIONS,
      a: 0,
      r: 0,
      nfn: 0,
      col: 0,
      slot: 0,
      y0: 0,
    };
    dirs.set(name, dir);
    dir.files.push(file);
    dir.a += file.a;
    dir.r += file.r;
    for (const fn of file.fns) {
      dir.maxDepth = Math.max(dir.maxDepth, fn.depth);
      dir.first = Math.min(dir.first, fn.order);
      dir.nfn += 1;
    }
  }
  const list = [...dirs.values()].sort((x, y) => x.first - y.first || x.name.localeCompare(y.name));
  for (const dir of list) {
    dir.col = dir.maxDepth ? Math.min(dir.maxDepth, 3) - 1 : 3;
    dir.files.sort((x, y) => x.p.localeCompare(y.p));
  }
  // Pack folders into columns by call depth; a tall column wraps into extra columns.
  let layerStart = 0;
  for (const col of [0, 1, 2, 3]) {
    let sub = 0;
    let y = 24;
    for (const dir of list.filter((candidate) => candidate.col === col)) {
      const height = heightOf(dir);
      if (y > 24 && y + height > COLUMN_LIMIT) {
        sub += 1;
        y = 24;
      }
      dir.slot = layerStart + sub;
      dir.y0 = y;
      y += height + 24;
    }
    layerStart += sub + (list.some((dir) => dir.col === col) ? 1 : 0);
  }
  return list;
};

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** A curve from the caller's side to the callee's side, as the artifact routes it. */
const routeEdge = (from: Rect, to: Rect): MapLine => {
  let sx: number;
  let ex: number;
  let c1x: number;
  let c2x: number;
  const sy = from.y + from.h / 2;
  const ey = to.y + to.h / 2;
  if (to.x >= from.x + from.w + 20) {
    sx = from.x + from.w;
    ex = to.x;
    c1x = (sx + ex) / 2;
    c2x = c1x;
  } else if (to.x + to.w <= from.x - 20) {
    sx = from.x;
    ex = to.x + to.w;
    c1x = (sx + ex) / 2;
    c2x = c1x;
  } else {
    sx = from.x + from.w;
    ex = to.x + to.w;
    c1x = sx + 50;
    c2x = ex + 50;
  }
  const xs = [sx, ex, c1x, c2x];
  const ys = [sy, ey, sy, ey];
  const minX = Math.min(...xs) - 6;
  const minY = Math.min(...ys) - 6;
  const width = Math.max(...xs) + 6 - minX;
  const height = Math.max(...ys) + 6 - minY;
  const at = (x: number, y: number): string => `${round1(x - minX)} ${round1(y - minY)}`;
  return {
    left: Math.round(minX),
    top: Math.round(minY),
    width: Math.round(width),
    height: Math.round(height),
    path: `M ${at(sx, sy)} C ${at(c1x, sy)}, ${at(c2x, ey)}, ${at(ex, ey)}`,
    endX: round1(ex - minX),
    endY: round1(ey - minY),
  };
};

/** Boxes, nodes and edges for one level of the map, with the canvas size. */
export const layoutMap = (input: MapInput, view: MapView): MapLayout => {
  const { level, overlay } = view;
  const nodeHeight = level === 'code' ? 76 : 44;
  const heightOf = (dir: DirEntry): number => {
    if (level === 'arch') {
      return 78;
    }
    if (level === 'package') {
      return 34 + dir.files.length * 46;
    }
    return (
      34 +
      dir.files.reduce(
        (total, file) =>
          total + 28 + 10 + (file.fns.length ? file.fns.length * (nodeHeight + 10) : 26) + 12,
        0,
      )
    );
  };
  const dirs = groupDirectories(input, heightOf);
  const fileOf = new Map(input.functions.map((fn) => [fn.id, fn.file]));
  const anchor = (id: string): string => {
    const file = fileOf.get(id) ?? '';
    if (level === 'arch') {
      return dirOf(file);
    }
    return level === 'package' ? file : id;
  };

  const dirBoxes: MapBox[] = [];
  const fileBoxes: MapBox[] = [];
  const nodes: MapNode[] = [];
  const positions = new Map<string, Rect>();
  const pushNode = (
    node: Omit<
      MapNode,
      'left' | 'top' | 'width' | 'height' | 'selected' | 'add' | 'del' | 'tone'
    > & {
      change: 'added' | 'body' | 'signature' | null;
      additions: number;
      deletions: number;
    },
    rect: Rect,
  ): void => {
    positions.set(node.id, rect);
    nodes.push({
      id: node.id,
      left: Math.round(rect.x),
      top: Math.round(rect.y),
      width: Math.round(rect.w),
      height: Math.round(rect.h),
      label: node.label,
      sub: node.sub,
      title: node.title,
      add: overlay && node.additions ? `+${node.additions}` : '',
      del: overlay && node.deletions ? `−${node.deletions}` : '',
      mark: node.mark,
      tone: toneOf(overlay, node.change),
      selected: view.selectedId === node.id,
      preview: node.preview,
    });
  };

  for (const dir of dirs) {
    const dx = 32 + dir.slot * (DIR_WIDTH + GAP_X);
    if (level === 'arch') {
      pushNode(
        {
          id: dir.name,
          label: dir.name,
          sub: `${dir.files.length} files · ${dir.nfn} functions`,
          title: dir.name,
          mark: '',
          preview: [],
          change: dir.a + dir.r > 0 ? 'body' : null,
          additions: dir.a,
          deletions: dir.r,
        },
        { x: dx + 22, y: dir.y0, w: NODE_WIDTH, h: 60 },
      );
      continue;
    }
    let cy = dir.y0 + 34;
    for (const file of dir.files) {
      if (level === 'package') {
        pushNode(
          {
            id: file.p,
            label: baseName(file.p),
            sub: `${file.fns.length} functions`,
            title: file.p,
            mark: '',
            preview: [],
            change: file.added ? 'added' : file.a + file.r > 0 ? 'body' : null,
            additions: file.a,
            deletions: file.r,
          },
          { x: dx + 22, y: cy, w: NODE_WIDTH, h: 38 },
        );
        cy += 46;
        continue;
      }
      const count = file.fns.length;
      const fileHeight = 28 + 10 + (count ? count * (nodeHeight + 10) : 26);
      fileBoxes.push({
        left: Math.round(dx + 12),
        top: Math.round(cy),
        width: DIR_WIDTH - 24,
        height: Math.round(fileHeight),
        label: baseName(file.p),
        kind: 'file',
        touched: overlay && file.a + file.r > 0,
      });
      file.fns.forEach((fn, index) => {
        pushNode(
          {
            id: fn.id,
            label: fn.name,
            sub: kindOf(fn.change),
            title: `${fn.name} · ${fn.file}:${fn.line}`,
            mark: view.reviewedFiles.has(fn.file) ? '✓' : '',
            preview:
              level === 'code'
                ? fn.preview.map(([sign, text]) => ({
                    sign,
                    text: `${sign === '+' ? '+ ' : '− '}${text.trim()}`,
                  }))
                : [],
            change: fn.change,
            additions: fn.add,
            deletions: fn.del,
          },
          { x: dx + 22, y: cy + 38 + index * (nodeHeight + 10), w: NODE_WIDTH, h: nodeHeight },
        );
      });
      cy += fileHeight + 12;
    }
    dirBoxes.push({
      left: Math.round(dx),
      top: Math.round(dir.y0),
      width: DIR_WIDTH,
      height: Math.round(cy - dir.y0),
      label: dir.name,
      kind: 'directory',
      touched: overlay && dir.a + dir.r > 0,
    });
  }

  const merged = new Map<string, { from: string; to: string }>();
  for (const edge of input.edges) {
    const from = anchor(edge.from);
    const to = anchor(edge.to);
    if (from !== to && !merged.has(`${from}>${to}`)) {
      merged.set(`${from}>${to}`, { from, to });
    }
  }
  const edges: MapLine[] = [];
  for (const { from, to } of merged.values()) {
    const a = positions.get(from);
    const b = positions.get(to);
    if (a !== undefined && b !== undefined) {
      edges.push(routeEdge(a, b));
    }
  }

  const boxes = [...dirBoxes, ...fileBoxes];
  let maxX = 0;
  let maxY = 0;
  for (const item of [...boxes, ...nodes]) {
    maxX = Math.max(maxX, item.left + item.width);
    maxY = Math.max(maxY, item.top + item.height);
  }
  return { boxes, nodes, edges, width: maxX + 48, height: maxY + 90 };
};

export interface FolderFile {
  path: string;
  additions: number;
  deletions: number;
}

/** The files the map shows inside one folder, changed or holding a mapped function, by path. */
export const folderFiles = (input: MapInput, folder: string): FolderFile[] => {
  const files = new Map<string, FolderFile>();
  for (const fn of input.functions) {
    files.set(fn.file, { path: fn.file, additions: 0, deletions: 0 });
  }
  for (const file of input.files) {
    files.set(file.path, { path: file.path, additions: file.additions, deletions: file.deletions });
  }
  return [...files.values()]
    .filter((file) => dirOf(file.path) === folder)
    .sort((a, b) => a.path.localeCompare(b.path));
};
