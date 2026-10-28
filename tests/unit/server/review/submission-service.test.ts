import { describe, expect, it } from 'vitest';

import type { GhClient } from '../../../../src/server/gh/gh-client.ts';
import type { ReviewService } from '../../../../src/server/review/review-service.ts';
import { createSubmissionService } from '../../../../src/server/review/submission-service.ts';
import { ProcessFailure } from '../../../../src/server/security/run-process.ts';
import type { ReviewDrafts } from '../../../../src/server/store/review-drafts.ts';
import type { ReviewState } from '../../../../src/shared/review.ts';

const HEAD = 'a'.repeat(40);
const PR = { owner: 'acme', name: 'platform', number: 42 };

const inMemoryDrafts = (initial: ReviewState): ReviewDrafts & { current: () => ReviewState } => {
  let state = initial;
  const update = async (_key: string, change: (review: ReviewState) => ReviewState) => {
    state = change(state);
    return state;
  };
  return {
    current: () => state,
    load: async () => state,
    updateReview: update,
    updateDrafts: async (key, change) =>
      update(key, (review) => ({ ...review, drafts: change(review.drafts) })),
    saveDraft: async () => {
      throw new Error('not used');
    },
    deleteDraft: async () => state,
    saveOverall: async () => state,
  };
};

const ghThatTimesOut = (): GhClient => ({
  installed: true,
  exec: async (args) => {
    if (args[0] === 'api') {
      throw new ProcessFailure('timeout', 'The command did not finish within 60 s');
    }
    return { exitCode: 0, stdout: '', stderr: '', stdoutBytes: Buffer.alloc(0) };
  },
  run: async (args) => {
    if (args[0] === 'auth') {
      return JSON.stringify({
        hosts: { 'github.com': [{ state: 'success', active: true, login: 'me' }] },
      });
    }
    return JSON.stringify({
      number: 42,
      title: 'T',
      state: 'OPEN',
      isDraft: false,
      url: 'https://github.com/acme/platform/pull/42',
      baseRefName: 'main',
      headRefName: 'feature',
      baseRefOid: 'b'.repeat(40),
      headRefOid: HEAD,
      isCrossRepository: false,
      author: { login: 'someone' },
    });
  },
});

describe('submission service', () => {
  it('Timeout: records the attempt as unknown and keeps the drafts', async () => {
    const drafts = inMemoryDrafts({
      version: 1,
      overall: 'Overall',
      drafts: [],
      submissions: [],
    });
    const reviews: ReviewService = {
      load: async () => drafts.current(),
      saveDraft: async () => {
        throw new Error('not used');
      },
      deleteDraft: async () => drafts.current(),
      saveOverall: async () => drafts.current(),
    };
    const source = {
      headSha: async () => HEAD,
      fileDiff: async () => ({ kind: 'rows' as const, rows: [] }),
      changedFile: async () => {
        throw new Error('not used');
      },
      changedFiles: async () => [],
    };
    const service = createSubmissionService({ gh: ghThatTimesOut(), reviews, drafts });
    const target = { comparisonId: 'git:abc', pr: PR, source };
    const summary = await service.prepare(target);

    const result = await service.submit(target, summary.prepId);

    expect(result.outcome).toBe('unknown');
    expect(result.message).toMatch(/did not finish within 60 s\. The outcome is unknown/);
    expect(drafts.current().submissions).toEqual([expect.objectContaining({ state: 'unknown' })]);
    expect(drafts.current().overall).toBe('Overall');
  });
});
