import { describe, expect, it } from 'vitest';

import { parseBatch } from '../../../../src/server/map/snapshot.ts';

const record = (content: string): Buffer => {
  const bytes = Buffer.from(content, 'utf8');
  return Buffer.concat([
    Buffer.from(`${'a'.repeat(40)} blob ${bytes.length}\n`),
    bytes,
    Buffer.from('\n'),
  ]);
};

describe('parseBatch', () => {
  it('reads contents by byte size, including newlines and non-ASCII text', () => {
    const output = Buffer.concat([record('const a = 1;\nconst b = "€";\n'), record('')]);

    const parsed = parseBatch(output, ['c:a.ts', 'c:empty.ts']);

    expect(parsed.get('c:a.ts')).toBe('const a = 1;\nconst b = "€";\n');
    expect(parsed.get('c:empty.ts')).toBe('');
  });

  it('maps a missing object to null and keeps reading', () => {
    const output = Buffer.concat([Buffer.from('c:gone.ts missing\n'), record('x')]);

    const parsed = parseBatch(output, ['c:gone.ts', 'c:b.ts']);

    expect(parsed.get('c:gone.ts')).toBeNull();
    expect(parsed.get('c:b.ts')).toBe('x');
  });

  it('maps a tree (not a file) to null', () => {
    const output = Buffer.from(`${'b'.repeat(40)} tree 3\nabc\n`);

    expect(parseBatch(output, ['c:src']).get('c:src')).toBeNull();
  });
});
