import { describe, expect, it } from 'vitest';

import type { MapInput } from '../../../../src/client/map/layout.ts';
import { resolveSelection } from '../../../../src/client/map/selection.ts';

const input: MapInput = {
  files: [
    {
      path: 'src/lib/money.ts',
      oldPath: null,
      status: 'modified',
      additions: 3,
      deletions: 2,
      binary: false,
    },
  ],
  functions: [
    {
      id: 'src/lib/money.ts#formatMoney',
      name: 'formatMoney',
      file: 'src/lib/money.ts',
      line: 9,
      change: 'signature',
      add: 3,
      del: 2,
      depth: 1,
      preview: [],
      rows: [],
    },
    {
      id: 'src/lib/db.ts#query',
      name: 'query',
      file: 'src/lib/db.ts',
      line: 2,
      change: null,
      add: 0,
      del: 0,
      depth: 2,
      preview: [],
      rows: [],
    },
  ],
  edges: [],
};

describe('resolveSelection', () => {
  it('a folder at Architecture lists its files with their counts', () => {
    expect(resolveSelection(input, 'arch', 'src/lib')).toEqual({
      kind: 'folder',
      name: 'src/lib',
      files: [
        { path: 'src/lib/db.ts', additions: 0, deletions: 0 },
        { path: 'src/lib/money.ts', additions: 3, deletions: 2 },
      ],
      additions: 3,
      deletions: 2,
    });
  });

  it('a file at Package says whether the comparison changes it', () => {
    expect(resolveSelection(input, 'package', 'src/lib/money.ts')).toMatchObject({
      kind: 'file',
      changed: true,
    });
    expect(resolveSelection(input, 'package', 'src/lib/db.ts')).toMatchObject({
      kind: 'file',
      changed: false,
    });
  });

  it('a function at Module or Code', () => {
    expect(resolveSelection(input, 'code', 'src/lib/money.ts#formatMoney')).toMatchObject({
      kind: 'function',
      fn: { name: 'formatMoney' },
    });
  });

  it('nothing when the id is not on the map at this level', () => {
    expect([
      resolveSelection(input, 'module', null),
      resolveSelection(input, 'arch', 'web'),
      resolveSelection(input, 'package', 'src/lib/money.ts#formatMoney'),
    ]).toEqual([null, null, null]);
  });
});
