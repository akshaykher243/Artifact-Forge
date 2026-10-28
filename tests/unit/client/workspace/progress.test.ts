import { describe, expect, it } from 'vitest';

import { computeProgress } from '../../../../src/client/workspace/progress.ts';
import type { ChangedFile } from '../../../../src/shared/comparison.ts';

const file = (path: string, additions: number, deletions: number): ChangedFile => ({
  path,
  oldPath: null,
  status: 'modified',
  additions,
  deletions,
  binary: false,
});

describe('computeProgress', () => {
  it('Progress updates on review: 10 of 40 lines reviewed is 25%', () => {
    const files = [file('a.ts', 6, 4), file('b.ts', 20, 10)];

    expect(computeProgress(files, new Set(['a.ts']))).toEqual({
      remainingAdditions: 20,
      remainingDeletions: 10,
      percent: 25,
    });
  });

  it('starts at 0% with everything remaining', () => {
    expect(computeProgress([file('a.ts', 3, 2)], new Set())).toEqual({
      remainingAdditions: 3,
      remainingDeletions: 2,
      percent: 0,
    });
  });

  it('Empty comparison: 0% and nothing remaining', () => {
    expect(computeProgress([], new Set())).toEqual({
      remainingAdditions: 0,
      remainingDeletions: 0,
      percent: 0,
    });
  });

  it('rounds to a whole number', () => {
    const files = [file('a.ts', 1, 0), file('b.ts', 2, 0)];

    expect(computeProgress(files, new Set(['a.ts'])).percent).toBe(33);
  });
});
