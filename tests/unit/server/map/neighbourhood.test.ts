import { describe, expect, it } from 'vitest';

import type { FunctionDelta } from '../../../../src/server/map/changes.ts';
import { buildNeighbourhood, computeDepths } from '../../../../src/server/map/neighbourhood.ts';

const edge = (from: string, to: string) => ({ from, to });
const delta: FunctionDelta = { change: 'body', add: 1, del: 1, preview: [], rows: [] };

describe('computeDepths', () => {
  it('puts callers before callees by the longest path', () => {
    const depths = computeDepths(
      ['a', 'b', 'c', 'd'],
      [edge('a', 'b'), edge('b', 'c'), edge('a', 'c'), edge('d', 'c')],
    );

    expect(Object.fromEntries(depths)).toEqual({ a: 1, b: 2, c: 3, d: 1 });
  });

  it('breaks a cycle deterministically and terminates', () => {
    const depths = computeDepths(['a', 'b', 'c'], [edge('a', 'b'), edge('b', 'c'), edge('c', 'a')]);

    expect(Object.fromEntries(depths)).toEqual({ a: 1, b: 2, c: 3 });
  });

  it('gives isolated functions depth 1', () => {
    expect(Object.fromEntries(computeDepths(['x'], []))).toEqual({ x: 1 });
  });
});

describe('buildNeighbourhood', () => {
  it('Two hops away: keeps direct callers and callees only', () => {
    const graph = {
      declarations: new Map(),
      edges: [
        edge('f.ts#far', 'f.ts#caller'),
        edge('f.ts#caller', 'f.ts#changed'),
        edge('f.ts#changed', 'f.ts#callee'),
        edge('f.ts#callee', 'f.ts#deeper'),
      ],
    };

    const { functions, edges } = buildNeighbourhood(graph, new Map([['f.ts#changed', delta]]));

    expect(functions.map((fn) => [fn.id, fn.depth, fn.change])).toEqual([
      ['f.ts#callee', 3, null],
      ['f.ts#caller', 1, null],
      ['f.ts#changed', 2, 'body'],
    ]);
    expect(edges).toEqual([
      edge('f.ts#caller', 'f.ts#changed'),
      edge('f.ts#changed', 'f.ts#callee'),
    ]);
  });

  it('names a top-level caller as top-level code', () => {
    const graph = { declarations: new Map(), edges: [edge('s.ts#(top-level)', 's.ts#migrate')] };

    const { functions } = buildNeighbourhood(graph, new Map([['s.ts#migrate', delta]]));

    expect(functions[0]).toMatchObject({
      id: 's.ts#(top-level)',
      name: 'top-level code',
      file: 's.ts',
      line: 1,
    });
  });
});
