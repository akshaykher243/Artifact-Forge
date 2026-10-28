import { mkdtemp, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeRepo, snapshotRepo } from '../../fixtures/repo-builder.ts';
import { buildTestApp, callOp } from '../../fixtures/test-app.ts';

const SMALL = 'fixture:small';
/** `src/lib/money.ts` in the small sample; new-side lines 9 to 11 are added lines in one hunk. */
const MONEY = 7;

describe('review drafts on the sample comparison', () => {
  let dataDir: string;
  let app: FastifyInstance;

  beforeEach(async () => {
    dataDir = await realpath(await mkdtemp(join(tmpdir(), 'af-data-')));
    app = await buildTestApp({ fixture: 'small', dataDir });
  });

  afterEach(async () => {
    await app.close();
    await rm(dataDir, { recursive: true, force: true });
  });

  const save = (draft: Record<string, unknown>) =>
    callOp(app, 'saveDraft', { payload: { comparisonId: SMALL, pr: null, draft } });

  it('Single line: saves a draft anchored to the line and its text', async () => {
    const response = await save({
      fileIndex: MONEY,
      side: 'new',
      startLine: 9,
      endLine: 9,
      body: 'Check rounding',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.review.drafts).toEqual([
      expect.objectContaining({
        path: 'src/lib/money.ts',
        side: 'new',
        startLine: 9,
        endLine: 9,
        headSha: 'd085642',
        anchorText: ['export function formatMoney(minor: number, currency: Currency): string {'],
        body: 'Check rounding',
        state: 'draft',
      }),
    ]);
  });

  it('Range: saves a draft over lines 9 to 11', async () => {
    const { data } = (
      await save({
        fileIndex: MONEY,
        side: 'new',
        startLine: 9,
        endLine: 11,
        body: 'Whole function',
      })
    ).json();

    expect(data.review.drafts[0].anchorText).toHaveLength(3);
  });

  it('Range across hunks refused: refuses a range that reaches into folded lines', async () => {
    // src/cli/index.ts starts with "2 unchanged lines"; new lines 1 and 2 are not in the diff.
    const response = await save({ fileIndex: 4, side: 'new', startLine: 2, endLine: 4, body: 'x' });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.message).toBe(
      'Comments must be on lines in the diff, within one hunk on one side.',
    );
  });

  it.each(['', '   \n  '])('Empty text refused: refuses %j', async (body) => {
    const response = await save({ fileIndex: MONEY, side: 'new', startLine: 9, endLine: 9, body });

    expect(response.statusCode).toBe(400);
  });

  it('refuses a range that ends before it starts', async () => {
    const response = await save({
      fileIndex: MONEY,
      side: 'new',
      startLine: 11,
      endLine: 9,
      body: 'x',
    });

    expect(response.statusCode).toBe(400);
  });

  it('Edit: replaces the text of an existing draft', async () => {
    const { data } = (
      await save({ fileIndex: MONEY, side: 'new', startLine: 9, endLine: 9, body: 'First' })
    ).json();
    const id = data.draftId;

    const edited = (
      await save({ id, fileIndex: MONEY, side: 'new', startLine: 9, endLine: 9, body: 'Second' })
    ).json();

    expect(edited.data.review.drafts).toEqual([expect.objectContaining({ id, body: 'Second' })]);
  });

  it('Delete: removes a draft', async () => {
    const { data } = (
      await save({ fileIndex: MONEY, side: 'new', startLine: 9, endLine: 9, body: 'Gone soon' })
    ).json();

    const response = await callOp(app, 'deleteDraft', {
      payload: { comparisonId: SMALL, pr: null, draftId: data.draftId },
    });

    expect(response.json().data.drafts).toEqual([]);
  });

  it('Overall only: saves an overall comment with no inline drafts', async () => {
    const response = await callOp(app, 'saveOverall', {
      payload: { comparisonId: SMALL, pr: null, body: 'Looks good overall.' },
    });

    expect(response.json().data).toEqual({
      version: 1,
      overall: 'Looks good overall.',
      drafts: [],
      submissions: [],
    });
  });

  it('Survives restart: drafts reload from the data folder', async () => {
    await save({ fileIndex: MONEY, side: 'old', startLine: 5, endLine: 6, body: 'Old behaviour' });
    await app.close();
    app = await buildTestApp({ fixture: 'small', dataDir });

    const { data } = (
      await callOp(app, 'loadReview', { payload: { comparisonId: SMALL, pr: null } })
    ).json();

    expect(data.drafts).toEqual([
      expect.objectContaining({ side: 'old', startLine: 5, body: 'Old behaviour' }),
    ]);
  });
});

describe('drafts never touch the repository', () => {
  it('writes only to the data folder', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'af-root-')));
    const dataDir = await realpath(await mkdtemp(join(tmpdir(), 'af-data-')));
    const repo = await makeRepo(root);
    await repo.commit('base', { 'a.ts': 'one\n' });
    repo.git('switch', '--quiet', '-c', 'feature');
    await repo.commit('change', { 'a.ts': 'two\n' });
    const app = await buildTestApp({ root, dataDir });
    const before = await snapshotRepo(repo.path);
    const filesBefore = await readdir(repo.path);
    const { data } = (
      await callOp(app, 'compare', {
        payload: { source: 'git', repo: repo.path, base: 'main', head: 'feature' },
      })
    ).json();

    await callOp(app, 'saveDraft', {
      payload: {
        comparisonId: data.id,
        pr: null,
        draft: { fileIndex: 0, side: 'new', startLine: 1, endLine: 1, body: 'Why two?' },
      },
    });

    expect(await snapshotRepo(repo.path)).toEqual(before);
    expect(await readdir(repo.path)).toEqual(filesBefore);
    expect(await readdir(join(dataDir, 'reviews'))).toHaveLength(1);
    await app.close();
    await rm(root, { recursive: true, force: true });
    await rm(dataDir, { recursive: true, force: true });
  });
});
