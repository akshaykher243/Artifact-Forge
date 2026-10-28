import type { DiffRow } from '../../shared/comparison.ts';
import type { Declaration } from './declarations.ts';
import { indexDeclarations, parseFile } from './declarations.ts';

export type FunctionChange = 'added' | 'signature' | 'body';

export interface FunctionDelta {
  change: FunctionChange;
  add: number;
  del: number;
  /** The first changed lines, as `+` or `-` with their text. */
  preview: Array<['+' | '-', string]>;
  /** The diff rows inside the function, removed rows included where they were. */
  rows: DiffRow[];
}

export interface ChangedSourceFile {
  path: string;
  /** The merge-base text of the file (from its old path for a rename); null when it is new. */
  baseText: string | null;
  rows: readonly DiffRow[];
}

const PREVIEW_LINES = 2;

interface Touch {
  sign: '+' | '-';
  line: number;
  text: string;
}

/** Each diff row with the head line it sits at; a removed row takes the line that follows it. */
const placeRows = (rows: readonly DiffRow[]): Array<{ row: DiffRow; line: number }> => {
  const placed: Array<{ row: DiffRow; line: number }> = [];
  const pending: DiffRow[] = [];
  let lastLine = 1;
  for (const row of rows) {
    const newLine = row[2];
    if (row[0] === '-') {
      pending.push(row);
      continue;
    }
    if (newLine !== null) {
      for (const removed of pending.splice(0)) {
        placed.push({ row: removed, line: newLine });
      }
      lastLine = newLine;
      placed.push({ row, line: newLine });
    }
  }
  for (const removed of pending) {
    placed.push({ row: removed, line: lastLine });
  }
  return placed;
};

/** Each changed row at a head line: added rows at their own line, removed rows where they were. */
const touches = (placed: ReturnType<typeof placeRows>): Touch[] =>
  placed
    .filter(({ row }) => row[0] === '+' || row[0] === '-')
    .map(({ row, line }) => ({ sign: row[0] === '+' ? '+' : '-', line, text: row[3] }));

/** The smallest declaration around `line`, so nested functions take their own changes. */
const innermost = (declarations: readonly Declaration[], line: number): Declaration | null => {
  let best: Declaration | null = null;
  for (const declaration of declarations) {
    if (line >= declaration.startLine && line <= declaration.endLine) {
      if (
        best === null ||
        declaration.endLine - declaration.startLine < best.endLine - best.startLine
      ) {
        best = declaration;
      }
    }
  }
  return best;
};

/**
 * The functions of one changed file that the diff touches, each classified against the
 * merge base: new when its name did not exist there, signature when its parameters or return
 * type changed, body otherwise.
 */
export const classifyChanges = (
  headDeclarations: readonly Declaration[],
  file: ChangedSourceFile,
): Map<string, FunctionDelta> => {
  const base =
    file.baseText === null ? [] : indexDeclarations(file.path, parseFile(file.path, file.baseText));
  const baseByName = new Map(base.map((declaration) => [declaration.name, declaration]));
  const deltas = new Map<string, FunctionDelta>();
  const placed = placeRows(file.rows);
  for (const touch of touches(placed)) {
    const declaration = innermost(headDeclarations, touch.line);
    if (declaration === null) {
      continue;
    }
    let delta = deltas.get(declaration.id);
    if (delta === undefined) {
      const before = baseByName.get(declaration.name);
      const change: FunctionChange =
        before === undefined
          ? 'added'
          : before.signature === declaration.signature
            ? 'body'
            : 'signature';
      const { startLine, endLine } = declaration;
      const rows = placed
        .filter(({ line }) => line >= startLine && line <= endLine)
        .map(({ row }) => row);
      delta = { change, add: 0, del: 0, preview: [], rows };
      deltas.set(declaration.id, delta);
    }
    if (touch.sign === '+') {
      delta.add += 1;
    } else {
      delta.del += 1;
    }
    if (delta.preview.length < PREVIEW_LINES) {
      delta.preview.push([touch.sign, touch.text]);
    }
  }
  return deltas;
};
