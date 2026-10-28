/**
 * Ported from the prflow artifact's `tokenize`, `segments`, `wordRange` and `toSplit`.
 * The logic is unchanged; colours became token kinds and tones, which map to the same
 * colour values in styles/tokens.css.
 */
import type { DiffRow } from '../../shared/comparison.ts';

export type TokenKind = 'plain' | 'keyword' | 'string' | 'number' | 'literal' | 'type' | 'comment';

export interface Token {
  text: string;
  kind: TokenKind;
}

export interface Segment extends Token {
  emphasis: boolean;
}

export type Range = readonly [start: number, end: number];

export interface WordRange {
  old: Range;
  new: Range;
}

export type Tone = 'context' | 'del' | 'add' | 'blank';

export interface SplitSide {
  lineNumber: string;
  segments: Segment[];
  tone: Tone;
}

export type SplitLine =
  { kind: 'fold'; text: string } | { kind: 'code'; left: SplitSide; right: SplitSide };

const KEYWORD =
  /^(const|let|var|function|return|if|else|for|while|async|await|class|new|import|from|export|type|interface|extends|implements|private|public|readonly|static|throw|try|catch|finally|of|in|typeof|void|this|default|switch|case|break|continue|enum|declare|as)$/;
const LITERAL = /^(null|undefined|true|false)$/;
const TOKEN =
  /(\/\/.*$|\/\*.*?\*\/)|('(?:\\.|[^'\\])*'?|"(?:\\.|[^"\\])*"?|`(?:\\.|[^`\\])*`?)|\b(\d+(?:\.\d+)?)\b|([A-Za-z_$][\w$]*)/g;
/** Below this share of the longer line, a paired change gets an inner highlight. */
const WORD_RANGE_MAX_SHARE = 0.7;
const EMPTY_SEGMENT: Segment = { text: ' ', kind: 'plain', emphasis: false };

const kindOf = (comment?: string, str?: string, num?: string, word?: string): TokenKind => {
  if (comment) {
    return 'comment';
  }
  if (str) {
    return 'string';
  }
  if (num) {
    return 'number';
  }
  if (word && KEYWORD.test(word)) {
    return 'keyword';
  }
  if (word && LITERAL.test(word)) {
    return 'literal';
  }
  if (word && /^[A-Z]/.test(word)) {
    return 'type';
  }
  return 'plain';
};

export const tokenize = (text: string): Token[] => {
  const tokens: Token[] = [];
  let last = 0;
  for (const match of text.matchAll(TOKEN)) {
    const [whole, comment, str, num, word] = match;
    if (match.index > last) {
      tokens.push({ text: text.slice(last, match.index), kind: 'plain' });
    }
    tokens.push({ text: whole, kind: kindOf(comment, str, num, word) });
    last = match.index + whole.length;
  }
  if (last < text.length) {
    tokens.push({ text: text.slice(last), kind: 'plain' });
  }
  return tokens;
};

/** Syntax segments, with the changed middle `[start, end)` of the line marked for emphasis. */
export const segments = (text: string, emphasis: Range | null): Segment[] => {
  const result: Segment[] = [];
  let position = 0;
  for (const token of tokenize(text)) {
    const start = position;
    const end = position + token.text.length;
    const cuts = [start, end];
    if (emphasis && emphasis[0] > start && emphasis[0] < end) {
      cuts.push(emphasis[0]);
    }
    if (emphasis && emphasis[1] > start && emphasis[1] < end) {
      cuts.push(emphasis[1]);
    }
    cuts.sort((x, y) => x - y);
    for (let i = 0; i + 1 < cuts.length; i++) {
      const from = cuts[i] ?? 0;
      const to = cuts[i + 1] ?? 0;
      if (to <= from) {
        continue;
      }
      const emphasised = emphasis !== null && from >= emphasis[0] && to <= emphasis[1];
      result.push({ text: text.slice(from, to), kind: token.kind, emphasis: emphasised });
    }
    position = end;
  }
  return result.length === 0 ? [EMPTY_SEGMENT] : result;
};

/** The differing middle of two lines after their common prefix and suffix, if it is small enough. */
export const wordRange = (oldText: string, newText: string): WordRange | null => {
  let prefix = 0;
  while (
    prefix < oldText.length &&
    prefix < newText.length &&
    oldText[prefix] === newText[prefix]
  ) {
    prefix++;
  }
  let suffix = 0;
  while (
    suffix < oldText.length - prefix &&
    suffix < newText.length - prefix &&
    oldText[oldText.length - 1 - suffix] === newText[newText.length - 1 - suffix]
  ) {
    suffix++;
  }
  const oldChanged = oldText.length - prefix - suffix;
  const newChanged = newText.length - prefix - suffix;
  const longest = Math.max(oldText.length, newText.length, 1);
  if (Math.max(oldChanged, newChanged) >= WORD_RANGE_MAX_SHARE * longest) {
    return null;
  }
  return { old: [prefix, oldText.length - suffix], new: [prefix, newText.length - suffix] };
};

const BLANK_SIDE: SplitSide = { lineNumber: '', segments: [EMPTY_SEGMENT], tone: 'blank' };

const side = (
  line: number | null,
  text: string,
  tone: Tone,
  emphasis: Range | null,
): SplitSide => ({
  lineNumber: line === null ? '' : String(line),
  segments: segments(text, emphasis),
  tone,
});

const pairRun = (removed: DiffRow[], added: DiffRow[]): SplitLine[] => {
  const lines: SplitLine[] = [];
  for (let k = 0; k < Math.max(removed.length, added.length); k++) {
    const del = removed[k];
    const add = added[k];
    const range = del && add ? wordRange(del[3], add[3]) : null;
    lines.push({
      kind: 'code',
      left: del ? side(del[1], del[3], 'del', range?.old ?? null) : BLANK_SIDE,
      right: add ? side(add[2], add[3], 'add', range?.new ?? null) : BLANK_SIDE,
    });
  }
  return lines;
};

/** Unified rows to side-by-side lines, pairing removed and added runs and blanking the empty side. */
export const toSplit = (rows: readonly DiffRow[]): SplitLine[] => {
  const lines: SplitLine[] = [];
  let i = 0;
  while (i < rows.length) {
    const row = rows[i] as DiffRow;
    if (row[0] === '~') {
      lines.push({ kind: 'fold', text: row[3] });
      i++;
      continue;
    }
    if (row[0] === ' ') {
      lines.push({
        kind: 'code',
        left: side(row[1], row[3], 'context', null),
        right: side(row[2], row[3], 'context', null),
      });
      i++;
      continue;
    }
    const removed: DiffRow[] = [];
    const added: DiffRow[] = [];
    while (rows[i]?.[0] === '-') {
      removed.push(rows[i++] as DiffRow);
    }
    while (rows[i]?.[0] === '+') {
      added.push(rows[i++] as DiffRow);
    }
    lines.push(...pairRun(removed, added));
  }
  return lines;
};
