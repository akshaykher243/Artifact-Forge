import type { ChangedFile } from '../../shared/comparison.ts';

export interface Progress {
  remainingAdditions: number;
  remainingDeletions: number;
  /** Reviewed share of all changed lines, 0–100, rounded. */
  percent: number;
}

export const computeProgress = (
  files: readonly ChangedFile[],
  reviewed: ReadonlySet<string>,
): Progress => {
  let remainingAdditions = 0;
  let remainingDeletions = 0;
  let total = 0;
  let done = 0;
  for (const file of files) {
    const lines = file.additions + file.deletions;
    total += lines;
    if (reviewed.has(file.path)) {
      done += lines;
    } else {
      remainingAdditions += file.additions;
      remainingDeletions += file.deletions;
    }
  }
  const percent = total === 0 ? 0 : Math.round((done / total) * 100);
  return { remainingAdditions, remainingDeletions, percent };
};
