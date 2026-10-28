import { describe, expect, it } from 'vitest';

import { buildReviewRequest, parseCreatedReview } from '../../../../src/server/gh/reviews.ts';
import type { Draft, ReviewState } from '../../../../src/shared/review.ts';

let counter = 0;
const draft = (overrides: Partial<Draft>): Draft => {
  counter += 1;
  return {
    id: `00000000-0000-4000-8000-${String(counter).padStart(12, '0')}`,
    path: 'src/a.ts',
    side: 'new',
    startLine: 3,
    endLine: 3,
    headSha: 'head',
    anchorText: ['x'],
    body: 'Comment',
    state: 'draft',
    reviewUrl: null,
    updatedAt: '2026-10-27T00:00:00Z',
    ...overrides,
  };
};

const review = (drafts: Draft[], overall = ''): ReviewState => ({
  version: 1,
  overall,
  drafts,
  submissions: [],
});

describe('buildReviewRequest', () => {
  it('maps sides, single lines and ranges to GitHub’s fields', () => {
    const single = draft({ side: 'new', startLine: 9, endLine: 9, body: 'one line' });
    const range = draft({ side: 'old', startLine: 4, endLine: 6, body: 'old range' });

    const { request, draftIds } = buildReviewRequest(
      review([single, range], '  Overall  '),
      'abc123',
    );

    expect(request).toEqual({
      commit_id: 'abc123',
      event: 'COMMENT',
      body: 'Overall',
      comments: [
        { path: 'src/a.ts', body: 'one line', line: 9, side: 'RIGHT' },
        {
          path: 'src/a.ts',
          body: 'old range',
          line: 6,
          side: 'LEFT',
          start_line: 4,
          start_side: 'LEFT',
        },
      ],
    });
    expect(draftIds).toEqual([single.id, range.id]);
  });

  it('leaves out outdated and submitted drafts and counts the outdated ones', () => {
    const kept = draft({});
    const built = buildReviewRequest(
      review([
        kept,
        draft({ state: 'outdated' }),
        draft({ state: 'outdated' }),
        draft({ state: 'submitted' }),
      ]),
      'h',
    );

    expect(built.draftIds).toEqual([kept.id]);
    expect(built.outdatedCount).toBe(2);
  });

  it('always uses the Comment action', () => {
    expect(buildReviewRequest(review([draft({})]), 'h').request.event).toBe('COMMENT');
  });

  it('gives the same hash for the same review and a different one after any change', () => {
    const base = review([draft({ body: 'same' })]);

    expect(buildReviewRequest(base, 'h').hash).toBe(buildReviewRequest(base, 'h').hash);
    expect(buildReviewRequest(base, 'h').hash).not.toBe(buildReviewRequest(base, 'other').hash);
  });
});

describe('parseCreatedReview', () => {
  it('reads the review id and link from GitHub’s response', () => {
    expect(
      parseCreatedReview(
        '{"id":77,"html_url":"https://github.com/a/b/pull/1#pullrequestreview-77","state":"COMMENTED"}',
      ),
    ).toEqual({ id: 77, url: 'https://github.com/a/b/pull/1#pullrequestreview-77' });
  });

  it.each([
    '',
    'not json',
    '{"message":"ok"}',
    '[]',
    '{"id":77,"html_url":"javascript:alert(1)"}',
    '{"id":77,"html_url":"https://github.com.evil.example/a"}',
  ])('Unexpected output: %j is not a success', (stdout) => {
    expect(parseCreatedReview(stdout)).toBeNull();
  });
});
