import type { DiffRow, FileDiff } from '../../shared/comparison.ts';

export const MAX_DIFF_ROWS = 3_000;

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

interface Hunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
}

const parseHunkHeader = (line: string): Hunk | null => {
  const match = HUNK_HEADER.exec(line);
  if (match === null) {
    return null;
  }
  return {
    oldStart: Number(match[1]),
    oldCount: match[2] === undefined ? 1 : Number(match[2]),
    newStart: Number(match[3]),
  };
};

const foldRow = (count: number): DiffRow => ['~', null, null, `${count} unchanged lines`];

/**
 * Turns `git diff` output for one file into the artifact's rows. A fold row stands for the
 * unchanged lines before the first hunk and between hunks, so rows between two fold rows
 * always belong to one hunk.
 */
export const parseUnifiedDiff = (output: string): FileDiff => {
  const lines = output.split('\n');
  if (lines.some((line) => line.startsWith('Binary files ') || line === 'GIT binary patch')) {
    return { kind: 'notice', notice: 'Binary file not shown.' };
  }
  const rows: DiffRow[] = [];
  let oldLine = 0;
  let newLine = 0;
  let nextOldExpected = 1;
  let inHunk = false;

  for (const line of lines) {
    const hunk = parseHunkHeader(line);
    if (hunk !== null) {
      // A pure addition (`-0,0`) reports oldStart 0; there is nothing unchanged before it.
      const firstOld = hunk.oldCount === 0 ? hunk.oldStart + 1 : hunk.oldStart;
      const gap = firstOld - nextOldExpected;
      if (gap > 0) {
        rows.push(foldRow(gap));
      }
      oldLine = hunk.oldStart;
      newLine = hunk.newStart;
      nextOldExpected = firstOld + hunk.oldCount;
      inHunk = true;
      continue;
    }
    if (!inHunk) {
      continue;
    }
    const sign = line[0];
    const text = line.slice(1);
    if (sign === ' ') {
      rows.push([' ', oldLine++, newLine++, text]);
    } else if (sign === '-') {
      rows.push(['-', oldLine++, null, text]);
    } else if (sign === '+') {
      rows.push(['+', null, newLine++, text]);
    }
    // `\ No newline at end of file` and the trailing empty split are not diff lines.
    if (rows.length > MAX_DIFF_ROWS) {
      return {
        kind: 'notice',
        notice: `Large diff not shown: more than ${MAX_DIFF_ROWS.toLocaleString('en')} lines.`,
      };
    }
  }
  if (rows.length === 0) {
    return { kind: 'notice', notice: 'No content changes (renamed or mode change only).' };
  }
  return { kind: 'rows', rows };
};
