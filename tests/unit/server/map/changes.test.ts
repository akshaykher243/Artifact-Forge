import { describe, expect, it } from 'vitest';

import { parseUnifiedDiff } from '../../../../src/server/git/diff-parser.ts';
import { classifyChanges } from '../../../../src/server/map/changes.ts';
import { indexDeclarations, parseFile } from '../../../../src/server/map/declarations.ts';
import type { DiffRow } from '../../../../src/shared/comparison.ts';

const BASE = [
  'export function formatMoney(cents: number): string {',
  '  return `$${cents / 100}`;',
  '}',
  'export function total(items: number[]) {',
  '  return items.length;',
  '}',
  '',
].join('\n');

const rowsOf = (diff: string): DiffRow[] => {
  const parsed = parseUnifiedDiff(diff);
  return parsed.kind === 'rows' ? parsed.rows : [];
};

const classify = (head: string, rows: DiffRow[], baseText: string | null = BASE) =>
  Object.fromEntries(
    classifyChanges(indexDeclarations('a.ts', parseFile('a.ts', head)), {
      path: 'a.ts',
      baseText,
      rows,
    }),
  );

describe('classifyChanges', () => {
  it('Signature changed: parameters changed', () => {
    const head = BASE.replace(
      'formatMoney(cents: number)',
      'formatMoney(minor: number, currency: string)',
    );
    const rows = rowsOf(
      '@@ -1,3 +1,3 @@\n-export function formatMoney(cents: number): string {\n+export function formatMoney(minor: number, currency: string): string {\n   return `$${cents / 100}`;\n }\n',
    );

    expect(classify(head, rows)).toEqual({
      'a.ts#formatMoney': {
        change: 'signature',
        add: 1,
        del: 1,
        preview: [
          ['-', 'export function formatMoney(cents: number): string {'],
          ['+', 'export function formatMoney(minor: number, currency: string): string {'],
        ],
        rows,
      },
    });
  });

  it('keeps only the diff rows inside the function', () => {
    const head = BASE.replace('return items.length;', 'return items.reduce((a, b) => a + b, 0);');
    const rows = rowsOf(
      '@@ -2,5 +2,5 @@\n   return `$${cents / 100}`;\n }\n export function total(items: number[]) {\n-  return items.length;\n+  return items.reduce((a, b) => a + b, 0);\n }\n',
    );

    expect(classify(head, rows)['a.ts#total']?.rows).toEqual([
      [' ', 4, 4, 'export function total(items: number[]) {'],
      ['-', 5, null, '  return items.length;'],
      ['+', null, 5, '  return items.reduce((a, b) => a + b, 0);'],
      [' ', 6, 6, '}'],
    ]);
  });

  it('Body changed: same signature, different body', () => {
    const head = BASE.replace('return items.length;', 'return items.reduce((a, b) => a + b, 0);');
    const rows = rowsOf(
      '@@ -4,3 +4,3 @@\n export function total(items: number[]) {\n-  return items.length;\n+  return items.reduce((a, b) => a + b, 0);\n }\n',
    );

    expect(classify(head, rows)['a.ts#total']?.change).toBe('body');
  });

  it('New function: not present at the merge base', () => {
    const head = `${BASE}export const toMinor = (n: number) => n * 100;\n`;
    const rows = rowsOf('@@ -6,0 +7,1 @@\n+export const toMinor = (n: number) => n * 100;\n');

    expect(classify(head, rows)).toEqual({
      'a.ts#toMinor': {
        change: 'added',
        add: 1,
        del: 0,
        preview: [['+', 'export const toMinor = (n: number) => n * 100;']],
        rows: [['+', null, 7, 'export const toMinor = (n: number) => n * 100;']],
      },
    });
  });

  it('treats every function of a new file as new', () => {
    const head = 'export const a = () => 1;\n';

    expect(
      classify(head, rowsOf('@@ -0,0 +1,1 @@\n+export const a = () => 1;\n'), null)['a.ts#a']
        ?.change,
    ).toBe('added');
  });

  it('counts a removal-only change for the function it was removed from', () => {
    const head = BASE.replace('  return items.length;\n', '');
    const rows = rowsOf(
      '@@ -4,3 +4,2 @@\n export function total(items: number[]) {\n-  return items.length;\n }\n',
    );

    expect(classify(head, rows)['a.ts#total']).toMatchObject({ change: 'body', add: 0, del: 1 });
  });

  it('gives a change inside a nested function to the nested one', () => {
    const base = 'export function Page() {\n  const onClick = () => 1;\n  return onClick;\n}\n';
    const head = base.replace('() => 1', '() => 2');
    const rows = rowsOf(
      '@@ -2,1 +2,1 @@\n-  const onClick = () => 1;\n+  const onClick = () => 2;\n',
    );

    expect(Object.keys(classify(head, rows, base))).toEqual(['a.ts#onClick']);
  });

  it('ignores changes outside any function', () => {
    const head = `import x from 'y';\n${BASE}`;

    expect(classify(head, rowsOf("@@ -0,0 +1,1 @@\n+import x from 'y';\n"))).toEqual({});
  });
});
