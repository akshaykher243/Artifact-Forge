import type { MapEdge, MapFunction } from '../../shared/map.ts';
import { buildCallGraph } from './call-graph.ts';
import type { ChangedSourceFile, FunctionDelta } from './changes.ts';
import { classifyChanges } from './changes.ts';
import type { Declaration } from './declarations.ts';
import { buildNeighbourhood } from './neighbourhood.ts';

export interface AnalysisInput {
  /** Head-commit source files, as [path, text] pairs (plain data, so it can cross to a worker). */
  files: Array<[string, string]>;
  tsconfig: string | null;
  changed: ChangedSourceFile[];
}

export interface AnalysisResult {
  functions: MapFunction[];
  edges: MapEdge[];
}

/** The change neighbourhood of a comparison, from its head files and its changed files' diffs. */
export const analyze = (input: AnalysisInput): AnalysisResult => {
  const graph = buildCallGraph(new Map(input.files), input.tsconfig);
  const byFile = new Map<string, Declaration[]>();
  for (const declaration of graph.declarations.values()) {
    byFile.set(declaration.file, [...(byFile.get(declaration.file) ?? []), declaration]);
  }
  const deltas = new Map<string, FunctionDelta>();
  for (const file of input.changed) {
    for (const [id, delta] of classifyChanges(byFile.get(file.path) ?? [], file)) {
      deltas.set(id, delta);
    }
  }
  return buildNeighbourhood(graph, deltas);
};
