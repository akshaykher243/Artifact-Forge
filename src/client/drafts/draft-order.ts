import type { Draft } from '../../shared/review.ts';

/** `path:12`, `path:9–11`, with `(old)` for comments on the base side. */
export const draftLocation = (
  draft: Pick<Draft, 'path' | 'side' | 'startLine' | 'endLine'>,
): string => {
  const lines =
    draft.startLine === draft.endLine
      ? `${draft.startLine}`
      : `${draft.startLine}–${draft.endLine}`;
  return `${draft.path}:${lines}${draft.side === 'old' ? ' (old)' : ''}`;
};

/** Drafts in the order the diff shows them: by file (tree order), then line, then side. */
export const orderDrafts = (drafts: readonly Draft[], pathOrder: readonly string[]): Draft[] => {
  const rank = new Map(pathOrder.map((path, index) => [path, index]));
  return [...drafts].sort(
    (a, b) =>
      (rank.get(a.path) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(b.path) ?? Number.MAX_SAFE_INTEGER) ||
      a.endLine - b.endLine ||
      a.side.localeCompare(b.side),
  );
};

export const firstLine = (text: string): string => text.trim().split('\n')[0] ?? '';
