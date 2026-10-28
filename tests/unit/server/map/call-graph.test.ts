import ts from 'typescript';
import { describe, expect, it } from 'vitest';

import { buildCallGraph, createMemoryHost } from '../../../../src/server/map/call-graph.ts';
import { indexDeclarations, parseFile } from '../../../../src/server/map/declarations.ts';

const graph = (files: Record<string, string>, tsconfig: string | null = null) => {
  const result = buildCallGraph(new Map(Object.entries(files)), tsconfig);
  return {
    ids: [...result.declarations.keys()].sort(),
    edges: result.edges.map((edge) => `${edge.from} -> ${edge.to}`).sort(),
  };
};

describe('indexDeclarations', () => {
  it('finds functions, methods, accessors, constructors, function variables and default exports', () => {
    const source = parseFile(
      'a.ts',
      [
        'export function plain(a: number): number { return a; }',
        'export const arrow = (b: string) => b;',
        'const wrapped = ((c: number) => c) as (c: number) => number;',
        'class Cart {',
        '  constructor() {}',
        '  total(): number { return 1; }',
        '  get size() { return 0; }',
        '}',
        'export default function () {}',
        'const notAFunction = 3;',
      ].join('\n'),
    );

    const found = indexDeclarations('a.ts', source).map((d) => [
      d.id,
      d.startLine,
      d.endLine,
      d.signature,
    ]);

    expect(found).toEqual([
      ['a.ts#plain', 1, 1, '(a: number): number'],
      ['a.ts#arrow', 2, 2, '(b: string)'],
      ['a.ts#wrapped', 3, 3, '(c: number)'],
      ['a.ts#Cart.constructor', 5, 5, '()'],
      ['a.ts#Cart.total', 6, 6, '(): number'],
      ['a.ts#Cart.size', 7, 7, '()'],
      ['a.ts#default', 9, 9, '()'],
    ]);
  });

  it('keeps ids unique when a name repeats in one file', () => {
    const source = parseFile('a.ts', 'function f() {}\nnamespace N { function f() {} }\n');

    expect(indexDeclarations('a.ts', source).map((d) => d.id)).toEqual(['a.ts#f', 'a.ts#f:2']);
  });
});

describe('buildCallGraph', () => {
  it('resolves calls across files through imports and re-exports', () => {
    const result = graph({
      'src/lib/money.ts':
        'export const toMinor = (n: number) => n * 100;\nexport function format(n: number) { return String(toMinor(n)); }\n',
      'src/lib/index.ts': "export { format } from './money';\n",
      'src/app.ts':
        "import { format } from './lib';\nexport function render() { return format(1); }\n",
    });

    expect(result.edges).toEqual([
      'src/app.ts#render -> src/lib/money.ts#format',
      'src/lib/money.ts#format -> src/lib/money.ts#toMinor',
    ]);
  });

  it('resolves JSX components, methods and new to their declarations', () => {
    const result = graph({
      'web/Price.tsx': 'export const Price = ({ v }: { v: number }) => <b>{v}</b>;\n',
      'web/Cart.ts': 'export class Cart { constructor() {} total() { return 1; } }\n',
      'web/Page.tsx':
        "import { Price } from './Price';\nimport { Cart } from './Cart';\n" +
        'export function Page() { const c = new Cart(); return <Price v={c.total()} />; }\n',
    });

    expect(result.edges).toEqual([
      'web/Page.tsx#Page -> web/Cart.ts#Cart.constructor',
      'web/Page.tsx#Page -> web/Cart.ts#Cart.total',
      'web/Page.tsx#Page -> web/Price.tsx#Price',
    ]);
  });

  it('Path aliases: follows tsconfig paths', () => {
    const result = graph(
      {
        'src/lib/money.ts': 'export const toMinor = (n: number) => n * 100;\n',
        'src/app.ts':
          "import { toMinor } from '@/lib/money';\nexport const run = () => toMinor(2);\n",
      },
      '{ "compilerOptions": { "baseUrl": ".", "paths": { "@/*": ["src/*"] } } }',
    );

    expect(result.edges).toEqual(['src/app.ts#run -> src/lib/money.ts#toMinor']);
  });

  it('attributes calls outside any function to the file’s top-level code', () => {
    const result = graph({
      'scripts/migrate.ts': 'export async function migrate() {}\nmigrate();\n',
    });

    expect(result.edges).toEqual(['scripts/migrate.ts#(top-level) -> scripts/migrate.ts#migrate']);
  });

  it('drops calls into packages that are not in the snapshot', () => {
    const result = graph({
      'src/app.ts': "import express from 'express';\nexport const start = () => express();\n",
    });

    expect(result.edges).toEqual([]);
  });

  it('keeps going when a file does not parse cleanly', () => {
    const result = graph({
      'src/broken.ts': 'export function broken( {\n',
      'src/ok.ts': 'export const a = () => b();\nexport const b = () => 1;\n',
    });

    expect(result.edges).toEqual(['src/ok.ts#a -> src/ok.ts#b']);
  });
});

describe('createMemoryHost', () => {
  it('serves only the given files and never reads the disk', () => {
    const host = createMemoryHost(new Map([['src/a.ts', 'export {}']]));

    expect(host.readFile('/repo/src/a.ts')).toBe('export {}');
    expect(host.fileExists('/etc/hosts')).toBe(false);
    expect(host.readFile('/etc/hosts')).toBeUndefined();
    expect(host.getSourceFile('/etc/hosts', ts.ScriptTarget.Latest)).toBeUndefined();
    expect(host.directoryExists?.('/repo/src')).toBe(true);
    expect(host.directoryExists?.('/usr')).toBe(false);
  });
});
