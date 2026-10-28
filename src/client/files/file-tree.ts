import type { ChangedFile } from '../../shared/comparison.ts';

export interface DirRow {
  kind: 'dir';
  /** Full folder path, used as the collapse key. */
  path: string;
  /** Display name; single-child folder chains are merged, e.g. `apps/web/app`. */
  name: string;
  depth: number;
  open: boolean;
}

export interface FileRow {
  kind: 'file';
  file: ChangedFile;
  name: string;
  depth: number;
}

export type TreeRow = DirRow | FileRow;

interface Node {
  dirs: Map<string, Node>;
  files: ChangedFile[];
}

const emptyNode = (): Node => ({ dirs: new Map(), files: [] });

const baseName = (path: string): string => path.slice(path.lastIndexOf('/') + 1);

const buildNode = (files: readonly ChangedFile[]): Node => {
  const root = emptyNode();
  for (const file of files) {
    const parts = file.path.split('/');
    let node = root;
    for (const segment of parts.slice(0, -1)) {
      const child = node.dirs.get(segment) ?? emptyNode();
      node.dirs.set(segment, child);
      node = child;
    }
    node.files.push(file);
  }
  return root;
};

/** Follows a chain of folders that each hold exactly one folder and no files. */
const compressChain = (name: string, node: Node): { name: string; node: Node } => {
  let current = { name, node };
  while (current.node.dirs.size === 1 && current.node.files.length === 0) {
    const [childName, child] = [...current.node.dirs][0] as [string, Node];
    current = { name: `${current.name}/${childName}`, node: child };
  }
  return current;
};

const byName = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

const walk = (
  node: Node,
  depth: number,
  prefix: string,
  closed: ReadonlySet<string>,
): TreeRow[] => {
  const rows: TreeRow[] = [];
  for (const [dirName, child] of [...node.dirs].sort(([a], [b]) => byName(a, b))) {
    const chain = compressChain(dirName, child);
    const path = prefix + chain.name;
    const open = !closed.has(path);
    rows.push({ kind: 'dir', path, name: chain.name, depth, open });
    if (open) {
      rows.push(...walk(chain.node, depth + 1, `${path}/`, closed));
    }
  }
  const files = [...node.files].sort((a, b) => baseName(a.path).localeCompare(baseName(b.path)));
  for (const file of files) {
    rows.push({ kind: 'file', file, name: baseName(file.path), depth });
  }
  return rows;
};

/** The artifact's file tree: folders first (by name), then files; merged single-child chains. */
export const buildFileTree = (
  files: readonly ChangedFile[],
  closedDirs: ReadonlySet<string>,
): TreeRow[] => walk(buildNode(files), 0, '', closedDirs);

/** The compact list: every file once, by base name, in the comparison's order. */
export const buildCompactList = (files: readonly ChangedFile[]): FileRow[] =>
  files.map((file) => ({ kind: 'file', file, name: baseName(file.path), depth: 0 }));

/** Files in the order the expanded tree shows them; the diff sections follow this order. */
export const treeOrder = (files: readonly ChangedFile[]): ChangedFile[] =>
  buildFileTree(files, new Set())
    .filter((row): row is FileRow => row.kind === 'file')
    .map((row) => row.file);
