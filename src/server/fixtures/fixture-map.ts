import { readFile } from 'node:fs/promises';

import { z } from 'zod';

import { diffRowSchema } from '../../shared/comparison.ts';
import type { DependencyMap, MapEdge, MapFunction } from '../../shared/map.ts';
import { StartupError } from '../errors.ts';
import { fixturePath } from './fixture-source.ts';
import type { FixtureName } from './fixture-source.ts';

const changeSchema = z.enum(['added', 'signature', 'body']).nullable();

/** The artifact's entry-point paths and per-function diffs, as extracted into the fixtures. */
export const artifactCallDataSchema = z.object({
  steps: z.array(
    z.object({
      n: z.number(),
      rows: z.array(
        z.object({
          id: z.string(),
          depth: z.number(),
          name: z.string(),
          change: changeSchema,
          earlier: z.boolean(),
          add: z.number().optional(),
          del: z.number().optional(),
          kind: z.string().optional(),
        }),
      ),
    }),
  ),
  diffs: z.record(
    z.string(),
    z.object({ file: z.string(), line: z.number(), rows: z.array(diffRowSchema) }),
  ),
});

export type ArtifactCallData = z.infer<typeof artifactCallDataSchema>;

const TOP_LEVEL_NAME = 'top-level code';

/**
 * The map model the artifact itself drew: functions in order of first appearance on a path,
 * the deepest depth any path gives them, the change from the path that introduced it, and
 * a caller-to-callee edge for each step of each path (top-level code starts paths but is not drawn).
 */
export const mapFromArtifact = (data: ArtifactCallData): DependencyMap => {
  const functions = new Map<string, MapFunction>();
  const edges = new Map<string, MapEdge>();
  for (const step of data.steps) {
    const stack: Array<string | null> = [];
    for (const row of step.rows) {
      if (row.kind === 'sink') {
        continue;
      }
      const diff = data.diffs[row.id];
      if (diff === undefined) {
        continue;
      }
      const top = row.name === TOP_LEVEL_NAME;
      if (!top) {
        const existing = functions.get(row.id);
        const fn: MapFunction = existing ?? {
          id: row.id,
          name: row.name,
          file: diff.file,
          line: Math.max(1, diff.line),
          change: null,
          add: 0,
          del: 0,
          depth: row.depth,
          preview: diff.rows
            .filter((r) => r[0] === '+' || r[0] === '-')
            .slice(0, 2)
            .map((r): ['+' | '-', string] => [r[0] === '+' ? '+' : '-', r[3]]),
          rows: diff.rows,
        };
        fn.depth = Math.max(fn.depth, row.depth);
        if (row.change !== null && !row.earlier && fn.change === null) {
          fn.change = row.change;
          fn.add = row.add ?? 0;
          fn.del = row.del ?? 0;
        }
        functions.set(row.id, fn);
      }
      stack[row.depth] = top ? null : row.id;
      const parent = stack[row.depth - 1];
      if (!top && parent !== null && parent !== undefined) {
        edges.set(`${parent}>${row.id}`, { from: parent, to: row.id });
      }
    }
  }
  return {
    state: 'ready',
    sourceFileCount: new Set([...functions.values()].map((fn) => fn.file)).size,
    functions: [...functions.values()],
    edges: [...edges.values()],
  };
};

/** The artifact's map for one of its sample datasets. */
export const readFixtureMap = async (name: FixtureName): Promise<DependencyMap> => {
  const path = fixturePath(name);
  try {
    return mapFromArtifact(artifactCallDataSchema.parse(JSON.parse(await readFile(path, 'utf8'))));
  } catch {
    throw new StartupError(`Fixture "${name}" has no call data at ${path}`);
  }
};
