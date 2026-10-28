import { z } from 'zod';

import { diffRowSchema } from './comparison.ts';

/** One function on the map: changed, or a direct caller or callee of a changed one. */
export const mapFunctionSchema = z.object({
  id: z.string(),
  name: z.string(),
  file: z.string(),
  line: z.number().int().positive(),
  change: z.enum(['added', 'signature', 'body']).nullable(),
  add: z.number().int().nonnegative(),
  del: z.number().int().nonnegative(),
  /** Call depth inside the neighbourhood, from 1 (callers) rightwards (callees). */
  depth: z.number().int().positive(),
  preview: z.array(z.tuple([z.enum(['+', '-']), z.string()])),
  /** The function's own diff rows; empty when it did not change. */
  rows: z.array(diffRowSchema),
});

export type MapFunction = z.infer<typeof mapFunctionSchema>;

export const mapEdgeSchema = z.object({ from: z.string(), to: z.string() });

export type MapEdge = z.infer<typeof mapEdgeSchema>;

export const dependencyMapSchema = z.discriminatedUnion('state', [
  z.object({
    state: z.literal('ready'),
    sourceFileCount: z.number().int().nonnegative(),
    functions: z.array(mapFunctionSchema),
    edges: z.array(mapEdgeSchema),
  }),
  z.object({ state: z.literal('noSource') }),
  z.object({ state: z.literal('tooLarge'), sourceFileCount: z.number().int().nonnegative() }),
  z.object({ state: z.literal('failed'), message: z.string() }),
]);

export type DependencyMap = z.infer<typeof dependencyMapSchema>;

/** The most TypeScript and JavaScript files a head commit may hold for the map to be drawn. */
export const MAP_SOURCE_LIMIT = 3_000;

const SOURCE_EXTENSION = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/;
const GENERATED_FOLDERS = new Set(['node_modules', 'dist', 'build', '.next', 'coverage']);

/** A TypeScript or JavaScript source file worth analysing (not a declaration file or build output). */
export const isSourcePath = (path: string): boolean =>
  SOURCE_EXTENSION.test(path) &&
  !path.endsWith('.d.ts') &&
  !path.includes('\n') &&
  !path.split('/').some((segment) => GENERATED_FOLDERS.has(segment));
