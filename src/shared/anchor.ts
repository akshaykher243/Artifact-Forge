import type { DiffRow } from './comparison.ts';
import type { DraftSide } from './review.ts';

interface SideLine {
  line: number;
  text: string;
  hunk: number;
}

/** Lines commentable on one side, each with the hunk it belongs to (fold rows separate hunks). */
export const sideLines = (rows: readonly DiffRow[], side: DraftSide): SideLine[] => {
  const lines: SideLine[] = [];
  let hunk = 0;
  for (const [sign, oldLine, newLine, text] of rows) {
    if (sign === '~') {
      hunk++;
      continue;
    }
    const line = side === 'old' ? oldLine : newLine;
    if (line !== null) {
      lines.push({ line, text, hunk });
    }
  }
  return lines;
};

/**
 * The text of lines `start..end` on one side, if every one of them is in the diff and they all
 * sit in the same hunk; GitHub refuses comments on lines outside the diff or across hunks.
 */
export const anchorText = (
  rows: readonly DiffRow[],
  side: DraftSide,
  start: number,
  end: number,
): string[] | null => {
  const byLine = new Map(sideLines(rows, side).map((entry) => [entry.line, entry]));
  const first = byLine.get(start);
  if (first === undefined) {
    return null;
  }
  const texts: string[] = [];
  for (let line = start; line <= end; line++) {
    const entry = byLine.get(line);
    if (entry === undefined || entry.hunk !== first.hunk) {
      return null;
    }
    texts.push(entry.text);
  }
  return texts;
};
