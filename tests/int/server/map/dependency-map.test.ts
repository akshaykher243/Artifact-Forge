import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { MAP_SOURCE_LIMIT } from '../../../../src/shared/map.ts';
import type { FileContents, TestRepo } from '../../../fixtures/repo-builder.ts';
import { makeRepo, snapshotRepo } from '../../../fixtures/repo-builder.ts';
import { buildTestApp, callOp } from '../../../fixtures/test-app.ts';

const MONEY_BASE = [
  'export const toMinorUnits = (n: number) => Math.round(n * 100);',
  'export function formatMoney(cents: number): string {',
  '  return String(toMinorUnits(cents));',
  '}',
  '',
].join('\n');

const SUMMARY = [
  "import { formatMoney } from '../src/lib/money';",
  'export const OrderSummary = ({ total }: { total: number }) => <p>{formatMoney(total)}</p>;',
  '',
].join('\n');

describe('dependencyMap', { timeout: 60_000 }, () => {
  let root: string;
  let repo: TestRepo;
  let app: FastifyInstance;

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'af-map-')));
    repo = await makeRepo(root);
    app = await buildTestApp({ root });
  });

  afterEach(async () => {
    await app.close();
    await rm(root, { recursive: true, force: true });
  });

  /** Commits `base` on main, `head` on a branch, compares them and returns the map. */
  const mapOf = async (base: FileContents, head: FileContents) => {
    await repo.commit('base', base);
    repo.git('switch', '--quiet', '-c', 'feature');
    await repo.commit('head', head);
    const { data: comparison } = (
      await callOp(app, 'compare', {
        payload: { source: 'git', repo: repo.path, base: 'main', head: 'feature' },
      })
    ).json();
    const response = await callOp(app, 'dependencyMap', {
      payload: { comparisonId: comparison.id },
    });
    return response.json().data;
  };

  const summary = (map: {
    functions: Array<{ id: string; change: string | null }>;
    edges: Array<{ from: string; to: string }>;
  }) => ({
    functions: map.functions.map((fn) => `${fn.id} ${fn.change ?? 'unchanged'}`).sort(),
    edges: map.edges.map((edge) => `${edge.from} -> ${edge.to}`).sort(),
  });

  it('Changed function with a caller and a callee', async () => {
    const map = await mapOf(
      { 'src/lib/money.ts': MONEY_BASE, 'web/OrderSummary.tsx': SUMMARY },
      {
        'src/lib/money.ts': MONEY_BASE.replace(
          'formatMoney(cents: number)',
          'formatMoney(cents: number, currency: string)',
        ),
      },
    );

    expect(map.state).toBe('ready');
    expect(summary(map)).toEqual({
      functions: [
        'src/lib/money.ts#formatMoney signature',
        'src/lib/money.ts#toMinorUnits unchanged',
        'web/OrderSummary.tsx#OrderSummary unchanged',
      ],
      edges: [
        'src/lib/money.ts#formatMoney -> src/lib/money.ts#toMinorUnits',
        'web/OrderSummary.tsx#OrderSummary -> src/lib/money.ts#formatMoney',
      ],
    });
    const byId = Object.fromEntries(
      map.functions.map((fn: { id: string; depth: number }) => [fn.id, fn.depth]),
    );
    expect([
      byId['web/OrderSummary.tsx#OrderSummary'],
      byId['src/lib/money.ts#formatMoney'],
      byId['src/lib/money.ts#toMinorUnits'],
    ]).toEqual([1, 2, 3]);
  });

  it('New function: a function that did not exist at the merge base', async () => {
    const map = await mapOf(
      { 'src/lib/money.ts': 'export const a = () => 1;\n' },
      {
        'src/lib/money.ts':
          'export const a = () => toMinor(1);\nexport const toMinor = (n: number) => n * 100;\n',
      },
    );

    expect(summary(map).functions).toEqual([
      'src/lib/money.ts#a body',
      'src/lib/money.ts#toMinor added',
    ]);
  });

  it('compares a renamed file with its old path at the merge base', async () => {
    const map = await mapOf(
      { 'src/lib/money.ts': MONEY_BASE },
      {
        'src/lib/money.ts': null,
        'src/lib/currency.ts': MONEY_BASE.replace('String(', 'Number('),
      },
    );

    expect(summary(map).functions).toEqual([
      'src/lib/currency.ts#formatMoney body',
      'src/lib/currency.ts#toMinorUnits unchanged',
    ]);
  });

  it('Path aliases: resolves imports through tsconfig paths', async () => {
    const map = await mapOf(
      {
        'tsconfig.json':
          '{ "compilerOptions": { "baseUrl": ".", "paths": { "@/lib/*": ["src/lib/*"] } } }',
        'src/lib/money.ts': 'export const toMinor = (n: number) => n * 100;\n',
        'src/app.ts': "import { toMinor } from '@/lib/money';\nexport const run = () => 1;\n",
      },
      {
        'src/app.ts':
          "import { toMinor } from '@/lib/money';\nexport const run = () => toMinor(2);\n",
      },
    );

    expect(summary(map).edges).toEqual(['src/app.ts#run -> src/lib/money.ts#toMinor']);
  });

  it('Only documentation changed: reports there is nothing to map', async () => {
    const map = await mapOf(
      { 'docs/a.md': '# a\n', 'src/a.ts': 'export {};\n' },
      { 'docs/a.md': '# b\n' },
    );

    expect(map).toEqual({ state: 'noSource' });
  });

  it('Too large: does not analyse more than the limit', async () => {
    const many = Object.fromEntries(
      Array.from({ length: MAP_SOURCE_LIMIT + 1 }, (_, i) => [`src/f${i}.ts`, '']),
    );
    const map = await mapOf(many, { 'src/f0.ts': 'export const changed = 1;\n' });

    expect(map).toEqual({ state: 'tooLarge', sourceFileCount: MAP_SOURCE_LIMIT + 1 });
  });

  it('Syntax errors: maps what parses', async () => {
    const map = await mapOf(
      { 'src/ok.ts': 'export const a = () => 1;\n', 'src/broken.ts': 'export const x = 1;\n' },
      {
        'src/ok.ts': 'export const a = () => 2;\n',
        'src/broken.ts': 'export function broken( {\n',
      },
    );

    expect(map.state).toBe('ready');
    expect(summary(map).functions).toContain('src/ok.ts#a body');
  });

  it('Repository unchanged and Analysis is not repeated', async () => {
    await repo.commit('base', { 'src/a.ts': 'export const a = () => 1;\n' });
    repo.git('switch', '--quiet', '-c', 'feature');
    await repo.commit('head', { 'src/a.ts': 'export const a = () => 2;\n' });
    const before = await snapshotRepo(repo.path);
    const { data: comparison } = (
      await callOp(app, 'compare', {
        payload: { source: 'git', repo: repo.path, base: 'main', head: 'feature' },
      })
    ).json();

    const first = Date.now();
    const one = (
      await callOp(app, 'dependencyMap', { payload: { comparisonId: comparison.id } })
    ).json();
    const firstMs = Date.now() - first;
    const second = Date.now();
    const two = (
      await callOp(app, 'dependencyMap', { payload: { comparisonId: comparison.id } })
    ).json();
    const secondMs = Date.now() - second;

    expect(two).toEqual(one);
    expect(secondMs).toBeLessThan(firstMs);
    expect(await snapshotRepo(repo.path)).toEqual(before);
  });
});

describe('dependencyMap on the artifact sample', () => {
  it('returns the map the artifact drew', async () => {
    const app = await buildTestApp({ fixture: 'small' });

    const { data } = (
      await callOp(app, 'dependencyMap', { payload: { comparisonId: 'fixture:small' } })
    ).json();

    expect(data.state).toBe('ready');
    expect(
      data.functions.find((fn: { id: string }) => fn.id === 'src/lib/money.ts#formatMoney'),
    ).toMatchObject({
      change: 'signature',
      add: 3,
      del: 2,
      depth: 3,
    });
    expect(data.edges).toContainEqual({
      from: 'web/components/OrderSummary.tsx#OrderSummary',
      to: 'src/lib/money.ts#formatMoney',
    });
    await app.close();
  });
});
