import { describe, expect, it } from 'vitest';

import type { DiffRow } from '../../../src/shared/comparison.ts';
import { pathsToRecheck, reanchorDrafts } from '../../../src/shared/reanchor.ts';
import type { Draft } from '../../../src/shared/review.ts';

const draft = (overrides: Partial<Draft>): Draft => ({
  id: '11111111-1111-4111-8111-111111111111',
  path: 'a.ts',
  side: 'new',
  startLine: 2,
  endLine: 2,
  headSha: 'old-head',
  anchorText: ['const b = 2;'],
  body: 'Why 2?',
  state: 'draft',
  reviewUrl: null,
  updatedAt: '2026-10-26T00:00:00Z',
  ...overrides,
});

const ROWS: DiffRow[] = [
  [' ', 1, 1, 'const a = 1;'],
  ['+', null, 2, 'const b = 2;'],
  ['+', null, 3, 'const c = 3;'],
];

describe('reanchorDrafts', () => {
  it('Unchanged line: moves the draft to the new head', () => {
    const [result] = reanchorDrafts([draft({})], 'new-head', () => ROWS);

    expect(result).toMatchObject({ state: 'draft', headSha: 'new-head' });
  });

  it('Moved or changed line: marks the draft outdated and keeps its text', () => {
    const changed: DiffRow[] = [
      [' ', 1, 1, 'const a = 1;'],
      ['+', null, 2, 'const b = 20;'],
    ];

    const [result] = reanchorDrafts([draft({})], 'new-head', () => changed);

    expect(result).toMatchObject({ state: 'outdated', headSha: 'old-head', body: 'Why 2?' });
  });

  it('marks a draft outdated when its file is no longer changed', () => {
    const [result] = reanchorDrafts([draft({})], 'new-head', () => null);

    expect(result?.state).toBe('outdated');
  });

  it('leaves drafts at the current head, outdated and submitted drafts untouched', () => {
    const current = draft({ headSha: 'new-head' });
    const outdated = draft({ state: 'outdated' });
    const submitted = draft({ state: 'submitted' });

    expect(reanchorDrafts([current, outdated, submitted], 'new-head', () => null)).toEqual([
      current,
      outdated,
      submitted,
    ]);
  });

  it('lists only the paths that need re-checking', () => {
    const drafts = [
      draft({ path: 'a.ts' }),
      draft({ path: 'a.ts', startLine: 3, endLine: 3 }),
      draft({ path: 'b.ts', headSha: 'new-head' }),
      draft({ path: 'c.ts', state: 'outdated' }),
    ];

    expect(pathsToRecheck(drafts, 'new-head')).toEqual(['a.ts']);
  });
});
