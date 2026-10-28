import type { MapEdge, MapFunction } from '../../shared/map.ts';
import type { FunctionDelta } from './changes.ts';
import type { Declaration } from './declarations.ts';
import { TOP_LEVEL } from './declarations.ts';

export interface GraphInput {
  declarations: ReadonlyMap<string, Declaration>;
  edges: readonly MapEdge[];
}

const TOP_LEVEL_NAME = 'top-level code';

/** Stable order: by file, then line, then id. */
const byPosition = (
  a: { file: string; line: number; id: string },
  b: { file: string; line: number; id: string },
) => a.file.localeCompare(b.file) || a.line - b.line || a.id.localeCompare(b.id);

/**
 * Longest-path depth from 1. Edges that close a cycle (found by depth-first search in the
 * given order) are ignored, so every graph gets a deterministic layering.
 */
export const computeDepths = (
  ids: readonly string[],
  edges: readonly MapEdge[],
): Map<string, number> => {
  const out = new Map<string, string[]>(ids.map((id) => [id, []]));
  const incoming = new Map<string, number>(ids.map((id) => [id, 0]));
  for (const edge of edges) {
    out.get(edge.from)?.push(edge.to);
    incoming.set(edge.to, (incoming.get(edge.to) ?? 0) + 1);
  }
  const state = new Map<string, 'open' | 'done'>();
  const order: string[] = [];
  const kept: MapEdge[] = [];
  const visit = (id: string): void => {
    state.set(id, 'open');
    for (const next of out.get(id) ?? []) {
      const seen = state.get(next);
      if (seen === 'open') {
        continue;
      }
      kept.push({ from: id, to: next });
      if (seen === undefined) {
        visit(next);
      }
    }
    state.set(id, 'done');
    order.push(id);
  };
  const starts = [...ids.filter((id) => incoming.get(id) === 0), ...ids];
  for (const id of starts) {
    if (!state.has(id)) {
      visit(id);
    }
  }
  const keptOut = new Map<string, string[]>();
  for (const { from, to } of kept) {
    keptOut.set(from, [...(keptOut.get(from) ?? []), to]);
  }
  const depth = new Map<string, number>(ids.map((id) => [id, 1]));
  for (const id of order.reverse()) {
    for (const to of keptOut.get(id) ?? []) {
      depth.set(to, Math.max(depth.get(to) ?? 1, (depth.get(id) ?? 1) + 1));
    }
  }
  return depth;
};

const describe = (id: string, declarations: ReadonlyMap<string, Declaration>) => {
  const declaration = declarations.get(id);
  if (declaration !== undefined) {
    return { name: declaration.name, file: declaration.file, line: declaration.startLine };
  }
  const file = id.slice(0, id.lastIndexOf('#'));
  return { name: id.endsWith(`#${TOP_LEVEL}`) ? TOP_LEVEL_NAME : id, file, line: 1 };
};

/** The changed functions, their direct callers and callees, and the calls between them. */
export const buildNeighbourhood = (
  graph: GraphInput,
  deltas: ReadonlyMap<string, FunctionDelta>,
): { functions: MapFunction[]; edges: MapEdge[] } => {
  const ids = new Set(deltas.keys());
  for (const edge of graph.edges) {
    if (deltas.has(edge.to)) {
      ids.add(edge.from);
    }
    if (deltas.has(edge.from)) {
      ids.add(edge.to);
    }
  }
  const edges = graph.edges.filter((edge) => ids.has(edge.from) && ids.has(edge.to));
  const nodes = [...ids]
    .map((id) => ({ id, ...describe(id, graph.declarations) }))
    .sort(byPosition);
  const depths = computeDepths(
    nodes.map((node) => node.id),
    edges,
  );
  const functions = nodes.map((node) => {
    const delta = deltas.get(node.id);
    return {
      ...node,
      change: delta?.change ?? null,
      add: delta?.add ?? 0,
      del: delta?.del ?? 0,
      depth: depths.get(node.id) ?? 1,
      preview: delta?.preview ?? [],
      rows: delta?.rows ?? [],
    };
  });
  return { functions, edges };
};
