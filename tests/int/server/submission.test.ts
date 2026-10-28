import { mkdir, mkdtemp, readdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { reviewKeyOf } from '../../../src/server/review/review-service.ts';
import { authStatusRule, createFakeGh, prViewRule } from '../../fixtures/fake-gh.ts';
import type { FakeGh, FakeGhRule } from '../../fixtures/fake-gh.ts';
import { makePrSetup, PR_NUMBER } from '../../fixtures/pr-remote.ts';
import type { PrSetup } from '../../fixtures/pr-remote.ts';
import { buildTestApp, callOp } from '../../fixtures/test-app.ts';

const PR = { owner: 'acme', name: 'platform', number: PR_NUMBER };
const REVIEW_URL = 'https://github.com/acme/platform/pull/42#pullrequestreview-9001';

const createdRule = (): FakeGhRule => ({
  args: ['api'],
  stdout: JSON.stringify({ id: 9001, html_url: REVIEW_URL, state: 'COMMENTED' }),
});

describe('posting a review', () => {
  let root: string;
  let dataDir: string;
  let setup: PrSetup;
  let gh: FakeGh;
  let app: FastifyInstance;
  let comparisonId: string;
  let files: { path: string }[];

  let fetched: { baseSha: string; headSha: string };

  // These tests never change the remote, so the repositories are built and fetched once; every
  // test still gets its own app, data folder and fake gh, so no review state is shared.
  beforeAll(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'af-root-')));
    setup = await makePrSetup(root);
    const fetcher = await buildTestApp({ root });
    fetched = (
      await callOp(fetcher, 'fetchPr', {
        payload: { repo: setup.clone, remote: 'origin', number: PR_NUMBER, baseBranch: 'main' },
      })
    ).json().data;
    await fetcher.close();
  });

  afterAll(async () => {
    await setup.remove();
    await rm(root, { recursive: true, force: true });
  });

  beforeEach(async () => {
    dataDir = await realpath(await mkdtemp(join(tmpdir(), 'af-data-')));
    gh = await createFakeGh();
    app = await buildTestApp({ root, dataDir, ghHome: gh.home });
    const { data } = (
      await callOp(app, 'compare', {
        payload: { source: 'git', repo: setup.clone, base: fetched.baseSha, head: fetched.headSha },
      })
    ).json();
    comparisonId = data.id;
    files = data.files;
  });

  afterEach(async () => {
    await app.close();
    await gh.remove();
    await rm(dataDir, { recursive: true, force: true });
  });

  const rules = (...extra: FakeGhRule[]) =>
    gh.setRules([
      authStatusRule('octo-reviewer'),
      ...extra,
      prViewRule({ number: PR_NUMBER, baseRefOid: setup.baseSha, headRefOid: setup.headSha }),
    ]);

  const comment = async (path: string, line: number, body: string, endLine = line) =>
    (
      await callOp(app, 'saveDraft', {
        payload: {
          comparisonId,
          pr: PR,
          draft: {
            fileIndex: files.findIndex((file) => file.path === path),
            side: 'new',
            startLine: line,
            endLine,
            body,
          },
        },
      })
    ).json().data;

  const prepare = async () =>
    (await callOp(app, 'prepareSubmission', { payload: { comparisonId, pr: PR } })).json();
  const submit = (prepId: string) =>
    callOp(app, 'submitReview', { payload: { comparisonId, pr: PR, prepId } });
  const apiCalls = async () => (await gh.calls()).filter((call) => call.args[0] === 'api');

  it('summarises what will be sent and where', async () => {
    await rules();
    await comment('src/money.ts', 1, 'Rename?');
    await callOp(app, 'saveOverall', { payload: { comparisonId, pr: PR, body: 'Nice work.' } });

    const { data } = await prepare();

    expect(data).toMatchObject({
      owner: 'acme',
      name: 'platform',
      number: 42,
      title: 'Add multi-currency support',
      state: 'OPEN',
      baseRefName: 'main',
      headRefName: 'feature',
      headSha: setup.headSha,
      action: 'Comment',
      login: 'octo-reviewer',
      inlineCount: 1,
      hasOverall: true,
      outdatedCount: 0,
    });
    expect(data.prepId).toMatch(/^[0-9a-f]{64}$/);
    expect(await apiCalls()).toEqual([]);
  });

  it('Nothing to send: refuses an empty review', async () => {
    await rules();

    expect((await prepare()).error.code).toBe('nothing_to_send');
  });

  it('PR moved on: refuses when the pull request head is not the compared commit', async () => {
    await gh.setRules([
      authStatusRule('octo-reviewer'),
      prViewRule({ number: PR_NUMBER, baseRefOid: setup.baseSha, headRefOid: 'f'.repeat(40) }),
    ]);
    await comment('src/money.ts', 1, 'Rename?');

    const response = await prepare();

    expect(response.error).toEqual({
      code: 'pr_moved',
      message:
        'The pull request has new commits. Refresh it and check your comments before posting.',
    });
  });

  it('Success: posts one Comment review with its inline comments and records it', async () => {
    await rules(createdRule());
    await comment('src/money.ts', 1, 'Rename?');
    await comment('src/currency.ts', 1, 'Add GBP?');
    await callOp(app, 'saveOverall', { payload: { comparisonId, pr: PR, body: 'Nice work.' } });
    const { data: summary } = await prepare();

    const { data } = (await submit(summary.prepId)).json();

    expect(data.outcome).toBe('submitted');
    expect(data.reviewUrl).toBe(REVIEW_URL);
    expect(data.review.drafts.map((draft: { state: string }) => draft.state)).toEqual([
      'submitted',
      'submitted',
    ]);
    expect(data.review.overall).toBe('');
    const calls = await apiCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toEqual([
      'api',
      '--hostname',
      'github.com',
      '--method',
      'POST',
      'repos/acme/platform/pulls/42/reviews',
      '--input',
      '-',
    ]);
    expect(JSON.parse(calls[0]?.stdin ?? '')).toEqual({
      commit_id: setup.headSha,
      event: 'COMMENT',
      body: 'Nice work.',
      comments: [
        { path: 'src/money.ts', body: 'Rename?', line: 1, side: 'RIGHT' },
        { path: 'src/currency.ts', body: 'Add GBP?', line: 1, side: 'RIGHT' },
      ],
    });
  });

  it('Rejected by GitHub: shows gh’s message and keeps every draft', async () => {
    await rules({
      args: ['api'],
      exitCode: 1,
      stderr:
        'gh: Unprocessable Entity (HTTP 422)\nUser can only have one pending review per pull request',
    });
    await comment('src/money.ts', 1, 'Rename?');
    const { data: summary } = await prepare();

    const { data } = (await submit(summary.prepId)).json();

    expect(data.outcome).toBe('failed');
    expect(data.message).toContain('one pending review');
    expect(data.review.drafts[0].state).toBe('draft');
  });

  it('refuses a confirmation that no longer matches the review', async () => {
    await rules(createdRule());
    const draft = await comment('src/money.ts', 1, 'Rename?');
    const { data: summary } = await prepare();
    await callOp(app, 'saveDraft', {
      payload: {
        comparisonId,
        pr: PR,
        draft: {
          id: draft.draftId,
          fileIndex: files.findIndex((f) => f.path === 'src/money.ts'),
          side: 'new',
          startLine: 1,
          endLine: 1,
          body: 'Changed my mind',
        },
      },
    });

    const response = await submit(summary.prepId);

    expect(response.json().error).toEqual({
      code: 'review_changed',
      message: 'Review changed, confirm again.',
    });
    expect(await apiCalls()).toEqual([]);
  });

  it('Unexpected output: an unreadable success is an unknown outcome, and blocks a retry until checked', async () => {
    await rules({ args: ['api'], stdout: 'not what GitHub returns' });
    await comment('src/money.ts', 1, 'Rename?');
    const { data: summary } = await prepare();

    const { data } = (await submit(summary.prepId)).json();
    const retry = await submit(summary.prepId);

    expect(data.outcome).toBe('unknown');
    expect(data.review.drafts[0].state).toBe('draft');
    expect(retry.json().error.code).toBe('outcome_unknown');
    expect(await apiCalls()).toHaveLength(1);
  });

  it('Timeout then check: finds the review on GitHub and marks the drafts submitted', async () => {
    await rules({ args: ['api'], stdout: '' });
    await comment('src/money.ts', 1, 'Rename?');
    await callOp(app, 'saveOverall', { payload: { comparisonId, pr: PR, body: 'Overall note' } });
    const { data: summary } = await prepare();
    const { data: unknown } = (await submit(summary.prepId)).json();
    await rules({
      args: ['pr', 'view', '42', '--repo', 'github.com/acme/platform', '--json', 'reviews'],
      stdout: JSON.stringify({
        reviews: [
          {
            author: { login: 'someone-else' },
            body: 'Overall note',
            submittedAt: new Date().toISOString(),
          },
          {
            author: { login: 'octo-reviewer' },
            body: 'Overall note',
            submittedAt: new Date().toISOString(),
          },
        ],
      }),
    });

    const { data } = (
      await callOp(app, 'checkReviews', {
        payload: { comparisonId, pr: PR, attemptId: unknown.attemptId },
      })
    ).json();

    expect(data.outcome).toBe('submitted');
    expect(data.review.drafts[0].state).toBe('submitted');
    expect(await apiCalls()).toHaveLength(1);
  });

  it('when the check finds nothing, the reviewer may try again', async () => {
    await rules({ args: ['api'], stdout: '' });
    await comment('src/money.ts', 1, 'Rename?');
    const { data: summary } = await prepare();
    const { data: unknown } = (await submit(summary.prepId)).json();
    await rules(
      {
        args: ['pr', 'view', '42', '--repo', 'github.com/acme/platform', '--json', 'reviews'],
        stdout: JSON.stringify({ reviews: [] }),
      },
      createdRule(),
    );

    const { data: checked } = (
      await callOp(app, 'checkReviews', {
        payload: { comparisonId, pr: PR, attemptId: unknown.attemptId },
      })
    ).json();
    const { data: again } = (await submit(summary.prepId)).json();

    expect(checked).toMatchObject({
      outcome: 'unknown',
      message: 'No matching review was found on GitHub. You can try again.',
    });
    expect(again.outcome).toBe('submitted');
    expect(await apiCalls()).toHaveLength(2);
  });

  it('Double click: two submits at once post exactly once', async () => {
    await rules({ ...createdRule(), delayMs: 400 });
    await comment('src/money.ts', 1, 'Rename?');
    const { data: summary } = await prepare();

    const results = await Promise.all([submit(summary.prepId), submit(summary.prepId)]);

    expect(results.map((response) => response.statusCode).sort()).toEqual([200, 409]);
    expect(await apiCalls()).toHaveLength(1);
  });

  it('loading a review with nothing to settle writes nothing', async () => {
    await rules();

    await callOp(app, 'loadReview', { payload: { comparisonId, pr: PR } });

    expect(await readdir(dataDir, { recursive: true })).not.toContain('reviews');
  });

  it('an attempt left submitting by a restart reads as unknown', async () => {
    await rules();
    const file = join(dataDir, 'reviews', `${reviewKeyOf(comparisonId, PR)}.json`);
    await mkdir(join(dataDir, 'reviews'), { recursive: true });
    await writeFile(
      file,
      JSON.stringify({
        version: 1,
        overall: '',
        drafts: [],
        submissions: [
          {
            attemptId: '33333333-3333-4333-8333-333333333333',
            startedAt: '2026-10-27T00:00:00Z',
            state: 'submitting',
            bodyHash: 'x',
            overall: '',
            draftIds: [],
            reviewUrl: null,
            message: null,
            checkedAt: null,
          },
        ],
      }),
    );

    const { data } = (
      await callOp(app, 'loadReview', { payload: { comparisonId, pr: PR } })
    ).json();

    expect(data.submissions[0].state).toBe('unknown');
    expect(JSON.parse(await readFile(file, 'utf8')).submissions[0].state).toBe('unknown');
  });
});
