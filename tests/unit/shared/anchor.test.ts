import { describe, expect, it } from 'vitest';

import { anchorText, sideLines } from '../../../src/shared/anchor.ts';
import type { DiffRow } from '../../../src/shared/comparison.ts';

const ROWS: DiffRow[] = [
  ['~', null, null, '2 unchanged lines'],
  [' ', 3, 3, 'context'],
  ['-', 4, null, 'removed'],
  ['+', null, 4, 'added one'],
  ['+', null, 5, 'added two'],
  [' ', 5, 6, 'after'],
  ['~', null, null, '10 unchanged lines'],
  [' ', 16, 17, 'later'],
  ['+', null, 18, 'later added'],
];

describe('sideLines', () => {
  it('numbers each side separately and splits hunks at fold rows', () => {
    expect(sideLines(ROWS, 'new').map(({ line, hunk }) => [line, hunk])).toEqual([
      [3, 1],
      [4, 1],
      [5, 1],
      [6, 1],
      [17, 2],
      [18, 2],
    ]);
    expect(sideLines(ROWS, 'old').map(({ line }) => line)).toEqual([3, 4, 5, 16]);
  });
});

describe('anchorText', () => {
  it('Single line: returns the text of an added line', () => {
    expect(anchorText(ROWS, 'new', 4, 4)).toEqual(['added one']);
  });

  it('Range: returns every line of a range on one side', () => {
    expect(anchorText(ROWS, 'new', 3, 6)).toEqual(['context', 'added one', 'added two', 'after']);
  });

  it('allows a removed line on the old side', () => {
    expect(anchorText(ROWS, 'old', 4, 4)).toEqual(['removed']);
  });

  it('Range across hunks refused: a range spanning a fold row is refused', () => {
    expect(anchorText(ROWS, 'new', 6, 17)).toBeNull();
  });

  it('refuses a line that is not in the diff', () => {
    expect(anchorText(ROWS, 'new', 10, 10)).toBeNull();
  });

  it('refuses an added line on the old side', () => {
    expect(anchorText(ROWS, 'old', 18, 18)).toBeNull();
  });
});
