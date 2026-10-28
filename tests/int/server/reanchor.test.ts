import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createFakeGh } from '../../fixtures/fake-gh.ts';
import type { FakeGh } from '../../fixtures/fake-gh.ts';
import { makePrSetup, PR_NUMBER } from '../../fixtures/pr-remote.ts';
import type { PrSetup } from '../../fixtures/pr-remote.ts';
import { buildTestApp, callOp } from '../../fixtures/test-app.ts';

const PR = { owner: 'acme', name: 'platform', number: PR_NUMBER };

// Each test pushes to its own remote and fetches twice: dozens of Git processes, each one inspected
// by endpoint security on this machine. That cost is real, so these tests get a longer limit.
describe('drafts across new commits on a pull request', { timeout: 60_000 }, () => {
  let root: string;
  let setup: PrSetup;
  let gh: FakeGh;
  let app: FastifyInstance;

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'af-root-')));
    setup = await makePrSetup(root);
    gh = await createFakeGh();
    app = await buildTestApp({ root, ghHome: gh.home });
  });

  afterEach(async () => {
    await app.close();
    await setup.remove();
    await gh.remove();
    await rm(root, { recursive: true, force: true });
  });

  /** Fetches the PR as it is now and compares it; returns the comparison. */
  const comparePr = async (): Promise<{ id: string; files: { path: string }[] }> => {
    const { data: fetched } = (
      await callOp(app, 'fetchPr', {
        payload: { repo: setup.clone, remote: 'origin', number: PR_NUMBER, baseBranch: 'main' },
      })
    ).json();
    const { data } = (
      await callOp(app, 'compare', {
        payload: { source: 'git', repo: setup.clone, base: fetched.baseSha, head: fetched.headSha },
      })
    ).json();
    return data;
  };

  const comment = async (
    comparison: { id: string; files: { path: string }[] },
    path: string,
    line: number,
  ) =>
    callOp(app, 'saveDraft', {
      payload: {
        comparisonId: comparison.id,
        pr: PR,
        draft: {
          fileIndex: comparison.files.findIndex((file) => file.path === path),
          side: 'new',
          startLine: line,
          endLine: line,
          body: `About ${path}:${line}`,
        },
      },
    });

  const load = async (comparisonId: string) =>
    (await callOp(app, 'loadReview', { payload: { comparisonId, pr: PR } })).json().data;

  it('keeps drafts with the pull request, not the comparison', async () => {
    const first = await comparePr();
    await comment(first, 'src/money.ts', 1);
    await setup.pushToPr({ 'src/other.ts': 'export const other = 1;\n' });

    const second = await comparePr();

    expect(second.id).not.toBe(first.id);
    expect((await load(second.id)).drafts).toHaveLength(1);
  });

  it('Unchanged line: a draft on a file the new commit did not touch moves to the new head', async () => {
    const first = await comparePr();
    await comment(first, 'src/money.ts', 1);
    const newHead = await setup.pushToPr({ 'src/other.ts': 'export const other = 1;\n' });

    const second = await comparePr();
    const [draft] = (await load(second.id)).drafts;

    expect(draft).toMatchObject({ state: 'draft', headSha: newHead });
  });

  it('Moved or changed line: a draft whose line changed becomes outdated and keeps its text', async () => {
    const first = await comparePr();
    await comment(first, 'src/money.ts', 1);
    await setup.pushToPr({
      'src/money.ts':
        'export const toMinorUnits = (amount: number, digits = 2) => Math.round(amount * 10 ** digits);\n',
    });

    const second = await comparePr();
    const [draft] = (await load(second.id)).drafts;

    expect(draft).toMatchObject({ state: 'outdated', body: 'About src/money.ts:1' });
  });

  it('re-anchors an outdated draft when it is saved on a line again', async () => {
    const first = await comparePr();
    await comment(first, 'src/money.ts', 1);
    await setup.pushToPr({ 'src/money.ts': 'export const changed = true;\n' });
    const second = await comparePr();
    const [outdated] = (await load(second.id)).drafts;

    const { data } = (
      await callOp(app, 'saveDraft', {
        payload: {
          comparisonId: second.id,
          pr: PR,
          draft: {
            id: outdated.id,
            fileIndex: second.files.findIndex((file) => file.path === 'src/money.ts'),
            side: 'new',
            startLine: 1,
            endLine: 1,
            body: outdated.body,
          },
        },
      })
    ).json();

    expect(data.review.drafts).toEqual([
      expect.objectContaining({
        id: outdated.id,
        state: 'draft',
        anchorText: ['export const changed = true;'],
      }),
    ]);
  });
});
