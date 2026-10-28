import { anchorText } from './anchor.ts';
import type { DiffRow } from './comparison.ts';
import { DraftState } from './review.ts';
import type { Draft } from './review.ts';

const sameText = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length && a.every((line, index) => line === b[index]);

/**
 * Re-checks drafts written against another head commit. A draft whose lines still exist, in one
 * hunk, with identical text, moves to `head`; any other becomes outdated and keeps its text.
 * Outdated and submitted drafts are left alone.
 *
 * `rowsFor` gives a file's diff rows at `head`, or null when the file is no longer changed.
 */
export const reanchorDrafts = (
  drafts: readonly Draft[],
  head: string,
  rowsFor: (path: string) => readonly DiffRow[] | null,
): Draft[] =>
  drafts.map((draft) => {
    if (draft.state !== DraftState.draft || draft.headSha === head) {
      return draft;
    }
    const rows = rowsFor(draft.path);
    const text =
      rows === null ? null : anchorText(rows, draft.side, draft.startLine, draft.endLine);
    if (text !== null && sameText(text, draft.anchorText)) {
      return { ...draft, headSha: head };
    }
    return { ...draft, state: DraftState.outdated };
  });

/** Paths whose diffs are needed to re-check drafts at `head`. */
export const pathsToRecheck = (drafts: readonly Draft[], head: string): string[] => [
  ...new Set(
    drafts
      .filter((draft) => draft.state === DraftState.draft && draft.headSha !== head)
      .map((draft) => draft.path),
  ),
];
