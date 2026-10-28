import { describe, expect, it } from 'vitest';

import { folderFiles, layoutMap, MAP_LEVELS } from '../../../../src/client/map/layout.ts';
import type { MapInput, MapLayout, NodeTone } from '../../../../src/client/map/layout.ts';
import {
  artifactCallDataSchema,
  mapFromArtifact,
} from '../../../../src/server/fixtures/fixture-map.ts';
import type { ChangedFile, FileStatus } from '../../../../src/shared/comparison.ts';
import type { ArtifactData } from '../../../fixtures/artifact.ts';
import { loadArtifactModule } from '../../../fixtures/artifact.ts';

const artifact = loadArtifactModule();

const inputOf = (data: ArtifactData): MapInput => {
  const map = mapFromArtifact(artifactCallDataSchema.parse(data));
  if (map.state !== 'ready') {
    throw new Error('artifact map is not ready');
  }
  const files: ChangedFile[] = data.files.map((file) => ({
    path: file.p,
    oldPath: file.old,
    status: file.st as FileStatus,
    additions: file.a,
    deletions: file.r,
    binary: false,
  }));
  return { files, functions: map.functions, edges: map.edges };
};

interface ArtifactBox {
  left: string;
  top: string;
  width: string;
  height: string;
  label: string;
  kind: string;
  border: string;
}

interface ArtifactNode extends Omit<ArtifactBox, 'kind'> {
  sub: string;
  title: string;
  add: string;
  del: string;
  mark: string;
  selected: boolean;
  pv: Array<{ t: string; c: string }>;
}

interface ArtifactEdge {
  left: string;
  top: string;
  w: number;
  h: number;
  d: string;
  cx: number;
  cy: number;
}

const TONES: Record<string, NodeTone> = {
  '#3FBF82': 'added',
  '#E0A23B': 'changed',
  '#3A4568': 'plain',
};

/** The artifact's drawn values in the port's shape: numbers for pixels, tones for colours. */
const fromArtifact = (vals: Record<string, unknown>): MapLayout => {
  const n = (px: string): number => Number.parseInt(px, 10);
  return {
    boxes: (vals.mapBoxes as ArtifactBox[]).map((box) => ({
      left: n(box.left),
      top: n(box.top),
      width: n(box.width),
      height: n(box.height),
      label: box.label,
      kind: box.kind as 'directory' | 'file',
      touched: box.border === '#6B5A2E',
    })),
    nodes: (vals.mapNodes as ArtifactNode[]).map((node) => ({
      left: n(node.left),
      top: n(node.top),
      width: n(node.width),
      height: n(node.height),
      label: node.label,
      sub: node.sub,
      title: node.title,
      add: node.add,
      del: node.del,
      mark: node.mark,
      tone: TONES[node.border] ?? 'plain',
      selected: node.selected,
      preview: node.pv.map((row) => row.t),
    })) as unknown as MapLayout['nodes'],
    edges: (vals.mapEdges as ArtifactEdge[]).map((edge) => ({
      left: n(edge.left),
      top: n(edge.top),
      width: edge.w,
      height: edge.h,
      path: edge.d,
      endX: edge.cx,
      endY: edge.cy,
    })),
    width: n(vals.innerW as string),
    height: n(vals.innerH as string),
  };
};

/** Node ids are not drawn by the artifact (`toEqual` skips undefined); previews compare by text. */
const comparable = (layout: MapLayout) => ({
  ...layout,
  nodes: layout.nodes.map((node) => ({
    ...node,
    id: undefined,
    preview: node.preview.map((row) => row.text),
  })),
});

const datasets: Array<[string, ArtifactData]> = [
  ['small', artifact.SMALL],
  ['large', artifact.buildLarge()],
];

describe('layoutMap matches the artifact', () => {
  describe.each(datasets)('%s sample', (_name, data) => {
    const input = inputOf(data);

    it.each(
      MAP_LEVELS.flatMap(([level]) => [true, false].map((overlay) => [level, overlay] as const)),
    )('level %s, overlay %s', (level, overlay) => {
      const selectedId =
        layoutMap(input, { level, overlay, selectedId: null, reviewedFiles: new Set() }).nodes[1]
          ?.id ?? null;
      const ours = layoutMap(input, { level, overlay, selectedId, reviewedFiles: new Set() });
      const theirs = artifact.mapVals(data, {
        level,
        overlay,
        mapSel: selectedId,
        reviewed: {},
        fileReviewed: {},
        zoom: 1,
        view: 'map',
        gitOpen: true,
      });

      expect(comparable(ours)).toEqual(fromArtifact(theirs));
    });
  });
});

describe('layoutMap', () => {
  const input = inputOf(artifact.SMALL);

  it('marks every function of a reviewed file', () => {
    const file = input.functions[0]?.file ?? '';
    const layout = layoutMap(input, {
      level: 'module',
      overlay: true,
      selectedId: null,
      reviewedFiles: new Set([file]),
    });

    const marked = layout.nodes.filter((node) => node.mark === '✓').map((node) => node.id);
    expect(marked).toEqual(input.functions.filter((fn) => fn.file === file).map((fn) => fn.id));
  });

  it('Non-code files: draws changed files without functions as empty file boxes', () => {
    const files: ChangedFile[] = ['docs/money.md', 'package.json'].map((path) => ({
      path,
      oldPath: null,
      status: 'modified',
      additions: 1,
      deletions: 1,
      binary: false,
    }));
    const layout = layoutMap(
      { files, functions: [], edges: [] },
      { level: 'module', overlay: true, selectedId: null, reviewedFiles: new Set() },
    );

    expect(layout.boxes.filter((box) => box.kind === 'file').map((box) => box.label)).toEqual([
      'package.json',
      'money.md',
    ]);
    expect(layout.nodes).toEqual([]);
  });

  it('merges calls between the same two folders and drops calls inside one folder', () => {
    const fn = (id: string, depth: number) => ({
      id,
      name: id.slice(id.indexOf('#') + 1),
      file: id.slice(0, id.indexOf('#')),
      line: 1,
      change: null,
      add: 0,
      del: 0,
      depth,
      preview: [],
      rows: [],
    });
    const layout = layoutMap(
      {
        files: [],
        functions: [
          fn('web/a.ts#a', 1),
          fn('web/b.ts#b', 1),
          fn('lib/c.ts#c', 2),
          fn('lib/d.ts#d', 2),
        ],
        edges: [
          { from: 'web/a.ts#a', to: 'lib/c.ts#c' },
          { from: 'web/b.ts#b', to: 'lib/d.ts#d' },
          { from: 'web/a.ts#a', to: 'web/b.ts#b' },
        ],
      },
      { level: 'arch', overlay: true, selectedId: null, reviewedFiles: new Set() },
    );

    expect(layout.nodes.map((node) => node.id)).toEqual(['web', 'lib']);
    expect(layout.edges).toHaveLength(1);
  });
});

describe('folderFiles', () => {
  it('lists changed files and files holding mapped functions, with their counts', () => {
    const input = inputOf(artifact.SMALL);

    expect(folderFiles(input, 'src/lib')).toEqual([
      { path: 'src/lib/db.ts', additions: 0, deletions: 0 },
      { path: 'src/lib/money.ts', additions: 9, deletions: 4 },
    ]);
  });
});
