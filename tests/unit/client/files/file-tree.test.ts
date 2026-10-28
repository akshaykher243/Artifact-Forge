import { describe, expect, it } from 'vitest';

import {
  buildCompactList,
  buildFileTree,
  treeOrder,
} from '../../../../src/client/files/file-tree.ts';
import type { TreeRow } from '../../../../src/client/files/file-tree.ts';
import type { ChangedFile } from '../../../../src/shared/comparison.ts';

const file = (path: string): ChangedFile => ({
  path,
  oldPath: null,
  status: 'modified',
  additions: 1,
  deletions: 1,
  binary: false,
});

const outline = (rows: TreeRow[]): string[] =>
  rows.map((row) => `${'  '.repeat(row.depth)}${row.kind === 'dir' ? `${row.name}/` : row.name}`);

const SMALL_PATHS = [
  'docs/money.md',
  'package.json',
  'scripts/migrate-currency.ts',
  'src/api/routes.ts',
  'src/cli/index.ts',
  'src/events/webhooks.ts',
  'src/jobs/reconcile.ts',
  'src/lib/money.ts',
  'src/services/payments.ts',
  'web/app/orders/[id]/page.tsx',
  'web/components/OrderSummary.tsx',
];

describe('buildFileTree', () => {
  it('lays out the artifact sample: folders first, then files, chains merged', () => {
    const rows = buildFileTree(SMALL_PATHS.map(file), new Set());

    expect(outline(rows)).toEqual([
      'docs/',
      '  money.md',
      'scripts/',
      '  migrate-currency.ts',
      'src/',
      '  api/',
      '    routes.ts',
      '  cli/',
      '    index.ts',
      '  events/',
      '    webhooks.ts',
      '  jobs/',
      '    reconcile.ts',
      '  lib/',
      '    money.ts',
      '  services/',
      '    payments.ts',
      'web/',
      '  app/orders/[id]/',
      '    page.tsx',
      '  components/',
      '    OrderSummary.tsx',
      'package.json',
    ]);
  });

  it('Folder chain compression: merges services/orders/src into one row', () => {
    const rows = buildFileTree([file('services/orders/src/routes.ts')], new Set());

    expect(rows).toEqual([
      {
        kind: 'dir',
        path: 'services/orders/src',
        name: 'services/orders/src',
        depth: 0,
        open: true,
      },
      expect.objectContaining({ kind: 'file', name: 'routes.ts', depth: 1 }),
    ]);
  });

  it('Collapse a folder: hides its descendants and keeps the row closed', () => {
    const rows = buildFileTree(SMALL_PATHS.map(file), new Set(['src']));

    expect(outline(rows)).toContain('src/');
    expect(outline(rows)).not.toContain('  api/');
    expect(rows.find((row) => row.kind === 'dir' && row.path === 'src')).toMatchObject({
      open: false,
    });
  });

  it('keys a merged chain by its full path', () => {
    const rows = buildFileTree(SMALL_PATHS.map(file), new Set(['web/app/orders/[id]']));

    expect(outline(rows)).not.toContain('    page.tsx');
  });
});

describe('buildCompactList', () => {
  it('lists every file once by base name, flat', () => {
    expect(buildCompactList(SMALL_PATHS.map(file)).map((row) => [row.name, row.depth])).toEqual(
      SMALL_PATHS.map((path) => [path.slice(path.lastIndexOf('/') + 1), 0]),
    );
  });
});

describe('treeOrder', () => {
  it('orders files as the expanded tree shows them', () => {
    const ordered = treeOrder(SMALL_PATHS.map(file)).map((changed) => changed.path);

    expect(ordered[0]).toBe('docs/money.md');
    expect(ordered.at(-1)).toBe('package.json');
    expect(ordered).toHaveLength(SMALL_PATHS.length);
  });
});
