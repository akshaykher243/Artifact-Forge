import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { segments, tokenize, toSplit, wordRange } from '../../../../src/client/diff/render.ts';
import type { SplitLine, TokenKind, Tone } from '../../../../src/client/diff/render.ts';
import { diffRowSchema } from '../../../../src/shared/comparison.ts';
import type { DiffRow } from '../../../../src/shared/comparison.ts';
import { loadArtifactModule } from '../../../fixtures/artifact.ts';
import large from '../../../fixtures/large.json' with { type: 'json' };
import small from '../../../fixtures/small.json' with { type: 'json' };

interface OriginalSegment {
  t: string;
  c: string;
  fs?: string;
  bg: string;
}

interface OriginalLine {
  fold: boolean;
  text?: string;
  lno?: string;
  rno?: string;
  lsegs?: OriginalSegment[];
  rsegs?: OriginalSegment[];
  lbg?: string;
  rbg?: string;
}

const KIND_BY_COLOUR: Record<string, TokenKind> = {
  '#1D2330': 'plain',
  '#A3501E': 'string',
  '#9A5B00': 'number',
  '#1F4FB8': 'keyword',
  '#7B3BC4': 'literal',
  '#127A7A': 'type',
};

const TONE_BY_BACKGROUND: Record<string, Tone> = {
  '#FFFFFF': 'context',
  '#FDEDED': 'del',
  '#EAF6EE': 'add',
};

const fromOriginalSegment = (segment: OriginalSegment) => ({
  text: segment.t,
  kind: segment.fs === 'italic' ? 'comment' : KIND_BY_COLOUR[segment.c],
  emphasis: segment.bg !== 'transparent',
});

const fromOriginal = (line: OriginalLine): SplitLine => {
  if (line.fold) {
    return { kind: 'fold', text: line.text ?? '' };
  }
  return {
    kind: 'code',
    left: {
      lineNumber: line.lno ?? '',
      segments: (line.lsegs ?? []).map(fromOriginalSegment),
      tone: TONE_BY_BACKGROUND[line.lbg ?? ''] ?? 'blank',
    },
    right: {
      lineNumber: line.rno ?? '',
      segments: (line.rsegs ?? []).map(fromOriginalSegment),
      tone: TONE_BY_BACKGROUND[line.rbg ?? ''] ?? 'blank',
    },
  } as SplitLine;
};

const fileDiffsSchema = z.record(z.string(), z.array(diffRowSchema));

const allFixtureDiffs = (): [string, DiffRow[]][] => [
  ...Object.entries(fileDiffsSchema.parse(small.fileDiffs)),
  ...Object.entries(fileDiffsSchema.parse(large.fileDiffs)),
];

describe('ported renderer matches the artifact', () => {
  const artifact = loadArtifactModule();

  it.each(allFixtureDiffs())('renders %s exactly like the original', (_path, rows) => {
    const original = (artifact.toSplit(rows) as OriginalLine[]).map(fromOriginal);

    expect(toSplit(rows)).toEqual(original);
  });

  it.each([
    "  const s = 'it\\'s' + `t${x}` // trailing",
    '/* block */ export type A = null | undefined | true | 3.14;',
    '',
    '    ',
  ])('tokenizes %j like the original', (text) => {
    const original = (artifact.tokenize(text) as OriginalSegment[]).map((token) => ({
      text: token.t,
      kind: token.fs === 'italic' ? 'comment' : KIND_BY_COLOUR[token.c],
    }));

    expect(tokenize(text)).toEqual(original);
  });
});

describe('Side-by-side diff rendering', () => {
  const emphasisedText = (line: SplitLine | undefined, sideName: 'left' | 'right'): string =>
    (line?.kind === 'code' ? line[sideName].segments : [])
      .filter((segment) => segment.emphasis)
      .map((segment) => segment.text)
      .join('');

  it('Pairing and word highlight: pairs the lines and emphasises only the changed middle', () => {
    const rows: DiffRow[] = [
      ['-', 3, null, "import { toCents } from '../lib/money';"],
      ['+', null, 3, "import { toMinorUnits } from '../lib/money';"],
    ];

    const [line] = toSplit(rows);

    expect(line).toMatchObject({ kind: 'code', left: { tone: 'del' }, right: { tone: 'add' } });
    expect(emphasisedText(line, 'left')).toBe('Cen');
    expect(emphasisedText(line, 'right')).toBe('MinorUni');
  });

  it('Mostly rewritten line: pairs the lines without an inner highlight', () => {
    const rows: DiffRow[] = [
      ['-', 8, null, '  const cents = toCents(input.amount);'],
      ['+', null, 8, '  const minor = toMinorUnits(input.amount, currency);'],
    ];

    const [line] = toSplit(rows);

    expect(line).toMatchObject({ kind: 'code', left: { tone: 'del' }, right: { tone: 'add' } });
    expect(emphasisedText(line, 'left')).toBe('');
    expect(emphasisedText(line, 'right')).toBe('');
  });

  it('Unbalanced runs: blanks the left side of the third added line', () => {
    const rows: DiffRow[] = [
      ['-', 1, null, 'a'],
      ['-', 2, null, 'b'],
      ['+', null, 1, 'x'],
      ['+', null, 2, 'y'],
      ['+', null, 3, 'z'],
    ];

    const lines = toSplit(rows);

    expect(lines).toHaveLength(3);
    expect(lines[2]).toMatchObject({
      left: { tone: 'blank', lineNumber: '' },
      right: { tone: 'add' },
    });
  });

  it('renders a fold row as a full-width line', () => {
    expect(toSplit([['~', null, null, '3 unchanged lines']])).toEqual([
      { kind: 'fold', text: '3 unchanged lines' },
    ]);
  });

  it('keeps context lines on both sides with their own numbers', () => {
    const [line] = toSplit([[' ', 4, 6, 'return x;']]);

    expect(line).toMatchObject({
      left: { lineNumber: '4', tone: 'context' },
      right: { lineNumber: '6', tone: 'context' },
    });
  });
});

describe('wordRange', () => {
  it('returns the differing middle of both lines', () => {
    expect(wordRange('total(cents)', 'total(minor)')).toEqual({ old: [6, 11], new: [6, 11] });
  });

  it('gives up when the change is 70% or more of the longer line', () => {
    expect(wordRange('abcdefghij', 'abcXXXXXXXXXXX')).toBeNull();
  });

  it('highlights just under the 70% threshold', () => {
    expect(wordRange('aaaaaaaaaa', 'aaaXXXXXXa')).toEqual({ old: [3, 9], new: [3, 9] });
  });
});

describe('segments', () => {
  it('returns a single blank segment for empty text', () => {
    expect(segments('', null)).toEqual([{ text: ' ', kind: 'plain', emphasis: false }]);
  });

  it('splits a token at the emphasis boundary', () => {
    expect(segments('foobar', [3, 6])).toEqual([
      { text: 'foo', kind: 'plain', emphasis: false },
      { text: 'bar', kind: 'plain', emphasis: true },
    ]);
  });
});
