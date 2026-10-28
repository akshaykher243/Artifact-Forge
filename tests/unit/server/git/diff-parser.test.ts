import { describe, expect, it } from 'vitest';

import { MAX_DIFF_ROWS, parseUnifiedDiff } from '../../../../src/server/git/diff-parser.ts';

const HEADER = 'diff --git a/x.ts b/x.ts\nindex 1111111..2222222 100644\n--- a/x.ts\n+++ b/x.ts\n';

describe('parseUnifiedDiff', () => {
  it('numbers context, removed and added lines on their own sides', () => {
    const diff = `${HEADER}@@ -1,3 +1,3 @@\n a\n-b\n+B\n c\n`;

    expect(parseUnifiedDiff(diff)).toEqual({
      kind: 'rows',
      rows: [
        [' ', 1, 1, 'a'],
        ['-', 2, null, 'b'],
        ['+', null, 2, 'B'],
        [' ', 3, 3, 'c'],
      ],
    });
  });

  it('adds a fold row for unchanged lines before the first hunk and between hunks', () => {
    const diff = `${HEADER}@@ -4,2 +4,2 @@\n d\n-e\n+E\n@@ -20,1 +20,2 @@\n t\n+u\n`;

    const result = parseUnifiedDiff(diff);

    expect(result.kind === 'rows' && result.rows.filter((row) => row[0] === '~')).toEqual([
      ['~', null, null, '3 unchanged lines'],
      ['~', null, null, '14 unchanged lines'],
    ]);
  });

  it('handles a new file with no old side', () => {
    const diff =
      'diff --git a/n.ts b/n.ts\nnew file mode 100644\n--- /dev/null\n+++ b/n.ts\n@@ -0,0 +1,2 @@\n+one\n+two\n';

    expect(parseUnifiedDiff(diff)).toEqual({
      kind: 'rows',
      rows: [
        ['+', null, 1, 'one'],
        ['+', null, 2, 'two'],
      ],
    });
  });

  it('handles a pure insertion in the middle without a spurious fold', () => {
    const diff = `${HEADER}@@ -3,0 +4,1 @@\n+inserted\n`;

    expect(parseUnifiedDiff(diff)).toEqual({
      kind: 'rows',
      rows: [
        ['~', null, null, '3 unchanged lines'],
        ['+', null, 4, 'inserted'],
      ],
    });
  });

  it('ignores the "No newline at end of file" marker', () => {
    const diff = `${HEADER}@@ -1 +1 @@\n-a\n\\ No newline at end of file\n+b\n`;

    expect(parseUnifiedDiff(diff)).toEqual({
      kind: 'rows',
      rows: [
        ['-', 1, null, 'a'],
        ['+', null, 1, 'b'],
      ],
    });
  });

  it('keeps diff-like text inside lines as content', () => {
    const diff = `${HEADER}@@ -1 +1 @@\n-@@ -1 +1 @@\n+--- a/x\n`;

    expect(parseUnifiedDiff(diff)).toEqual({
      kind: 'rows',
      rows: [
        ['-', 1, null, '@@ -1 +1 @@'],
        ['+', null, 1, '--- a/x'],
      ],
    });
  });

  it('Binary or oversized file: reports a binary file as a notice', () => {
    expect(
      parseUnifiedDiff('diff --git a/i.png b/i.png\nBinary files a/i.png and b/i.png differ\n'),
    ).toEqual({
      kind: 'notice',
      notice: 'Binary file not shown.',
    });
  });

  it('Binary or oversized file: reports a diff over the row limit as a notice', () => {
    const body = Array.from({ length: MAX_DIFF_ROWS + 1 }, (_, i) => `+line ${i}`).join('\n');

    expect(parseUnifiedDiff(`${HEADER}@@ -0,0 +1,${MAX_DIFF_ROWS + 1} @@\n${body}\n`)).toEqual({
      kind: 'notice',
      notice: 'Large diff not shown: more than 3,000 lines.',
    });
  });

  it('reports a rename with no content change', () => {
    const diff =
      'diff --git a/a.ts b/b.ts\nsimilarity index 100%\nrename from a.ts\nrename to b.ts\n';

    expect(parseUnifiedDiff(diff)).toEqual({
      kind: 'notice',
      notice: 'No content changes (renamed or mode change only).',
    });
  });
});
