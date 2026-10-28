import type { ChangedFile, Comparison, FileDiff } from '../shared/comparison.ts';

/** Where comparisons come from: a Git repository, or one of the artifact's sample datasets. */
export interface ComparisonSource {
  compare: () => Promise<Comparison>;
  fileDiff: (comparisonId: string, fileIndex: number) => Promise<FileDiff>;
  /** The file at `fileIndex`; throws not-found for an unknown comparison or index. */
  changedFile: (comparisonId: string, fileIndex: number) => Promise<ChangedFile>;
  /** The head commit the comparison was made at. */
  headSha: (comparisonId: string) => Promise<string>;
  /** Every changed file of the comparison, in its order. */
  changedFiles: (comparisonId: string) => Promise<ChangedFile[]>;
}
