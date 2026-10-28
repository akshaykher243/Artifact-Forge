import type { FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it } from 'vitest';

import { buildTestApp, callOp } from '../../fixtures/test-app.ts';
import small from '../../fixtures/small.json' with { type: 'json' };

describe('fixture mode', () => {
  let app: FastifyInstance;

  afterEach(async () => {
    await app.close();
  });

  it('reports which fixture is served', async () => {
    app = await buildTestApp({ fixture: 'small' });

    const response = await callOp(app, 'appInfo');

    expect(response.json()).toMatchObject({ success: true, data: { fixture: 'small' } });
  });

  it('returns the small sample as a comparison', async () => {
    app = await buildTestApp({ fixture: 'small' });

    const { data } = (await callOp(app, 'compare', { payload: { source: 'fixture' } })).json();

    expect(data).toMatchObject({
      id: 'fixture:small',
      repo: 'prflow-platform',
      base: { name: 'main', sha: '260b552' },
      head: { name: 'feature/multi-currency', sha: 'd085642' },
    });
    expect(data.files).toHaveLength(11);
    expect(data.files[2]).toEqual({
      path: 'scripts/migrate-currency.ts',
      oldPath: null,
      status: 'added',
      additions: 9,
      deletions: 0,
      binary: false,
    });
  });

  it('returns a file diff by comparison id and file index', async () => {
    app = await buildTestApp({ fixture: 'small' });

    const response = await callOp(app, 'fileDiff', {
      payload: { comparisonId: 'fixture:small', fileIndex: 0 },
    });

    expect(response.json()).toEqual({
      success: true,
      data: { kind: 'rows', rows: small.fileDiffs['docs/money.md'] },
    });
  });

  it.each([
    { comparisonId: 'fixture:small', fileIndex: 99 },
    { comparisonId: 'fixture:large', fileIndex: 0 },
  ])('refuses a file outside the comparison: %o', async (payload) => {
    app = await buildTestApp({ fixture: 'small' });

    const response = await callOp(app, 'fileDiff', { payload });

    expect(response.statusCode).toBe(404);
  });

  it('refuses a file path instead of an index', async () => {
    app = await buildTestApp({ fixture: 'small' });

    const response = await callOp(app, 'fileDiff', {
      payload: { comparisonId: 'fixture:small', fileIndex: '../../etc/passwd' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('has no comparison without a source', async () => {
    app = await buildTestApp();

    const response = await callOp(app, 'compare', { payload: { source: 'fixture' } });

    expect(response.statusCode).toBe(404);
    expect((await callOp(app, 'appInfo')).json()).toMatchObject({
      success: true,
      data: { fixture: null },
    });
  });
});
