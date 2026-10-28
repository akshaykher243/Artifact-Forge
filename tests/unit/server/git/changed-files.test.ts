import { describe, expect, it } from 'vitest';

import {
  joinChangedFiles,
  parseNameStatus,
  parseNumstat,
} from '../../../../src/server/git/changed-files.ts';

describe('parseNameStatus', () => {
  it('reads added, modified, deleted, type-changed and renamed entries', () => {
    const output = 'A\0new.ts\0M\0mod.ts\0D\0gone.ts\0T\0link\0R087\0old name.ts\0new name.ts\0';

    expect(parseNameStatus(output)).toEqual([
      { status: 'added', path: 'new.ts', oldPath: null },
      { status: 'modified', path: 'mod.ts', oldPath: null },
      { status: 'deleted', path: 'gone.ts', oldPath: null },
      { status: 'modified', path: 'link', oldPath: null },
      { status: 'renamed', path: 'new name.ts', oldPath: 'old name.ts' },
    ]);
  });

  it('returns nothing for empty output', () => {
    expect(parseNameStatus('')).toEqual([]);
  });
});

describe('parseNumstat', () => {
  it('reads counts, binary files and renames', () => {
    const output = '3\t1\tmod.ts\0-\t-\timage.png\0' + '2\t0\t\0old name.ts\0new name.ts\0';

    expect([...parseNumstat(output)]).toEqual([
      ['mod.ts', { additions: 3, deletions: 1, binary: false }],
      ['image.png', { additions: 0, deletions: 0, binary: true }],
      ['new name.ts', { additions: 2, deletions: 0, binary: false }],
    ]);
  });
});

describe('joinChangedFiles', () => {
  it('joins status and counts by path, keeping Git order', () => {
    const files = joinChangedFiles(
      'R100\0a.ts\0b.ts\0M\0c.ts\0',
      '0\t0\t\0a.ts\0b.ts\0' + '5\t2\tc.ts\0',
    );

    expect(files).toEqual([
      {
        status: 'renamed',
        path: 'b.ts',
        oldPath: 'a.ts',
        additions: 0,
        deletions: 0,
        binary: false,
      },
      {
        status: 'modified',
        path: 'c.ts',
        oldPath: null,
        additions: 5,
        deletions: 2,
        binary: false,
      },
    ]);
  });
});
