import { createHash } from 'node:crypto';
import { basename } from 'node:path';

import type { ChangedFile, Comparison, FileDiff } from '../../shared/comparison.ts';
import { ErrorCode } from '../../shared/envelope.ts';
import { AppError } from '../errors.ts';
import { joinChangedFiles } from './changed-files.ts';
import { parseUnifiedDiff } from './diff-parser.ts';
import type { GitClient } from './git-client.ts';
import { resolveCommit } from './refs.ts';

/** Comparisons kept for `fileDiff`; an older one must be compared again. */
const CACHE_SIZE = 20;
const DIFF_FLAGS = ['--no-ext-diff', '--no-textconv', '--no-color', '-M'] as const;

interface CachedComparison {
  repoPath: string;
  mergeBase: string;
  head: string;
  files: ChangedFile[];
}

export interface CompareRequest {
  repoPath: string;
  base: string;
  head: string;
  baseLabel: string | null;
  headLabel: string | null;
}

export interface GitComparisons {
  compare: (request: CompareRequest) => Promise<Comparison>;
  fileDiff: (comparisonId: string, fileIndex: number) => Promise<FileDiff>;
  changedFile: (comparisonId: string, fileIndex: number) => Promise<ChangedFile>;
  headSha: (comparisonId: string) => Promise<string>;
  changedFiles: (comparisonId: string) => Promise<ChangedFile[]>;
  /** Where the comparison lives and which commits it compares. */
  details: (comparisonId: string) => Promise<ComparisonDetails>;
}

export interface ComparisonDetails {
  repoPath: string;
  mergeBase: string;
  head: string;
  files: ChangedFile[];
}

const comparisonId = (repoPath: string, mergeBase: string, head: string): string =>
  `git:${createHash('sha256').update(`${repoPath}\0${mergeBase}\0${head}`).digest('hex').slice(0, 32)}`;

const findMergeBase = async (
  git: GitClient,
  repoPath: string,
  base: string,
  head: string,
): Promise<string> => {
  const result = await git.exec(repoPath, ['merge-base', base, head]);
  if (result.exitCode !== 0) {
    throw new AppError(ErrorCode.noCommonHistory, 400, 'These refs have no common history.');
  }
  return result.stdout.trim();
};

/**
 * Compares as a pull request does: the changes on head since its merge base with base.
 * The repository path must already be validated and confined by the caller.
 */
export const createGitComparisons = (git: GitClient): GitComparisons => {
  const cache = new Map<string, CachedComparison>();

  const remember = (id: string, entry: CachedComparison): void => {
    cache.delete(id);
    cache.set(id, entry);
    if (cache.size > CACHE_SIZE) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) {
        cache.delete(oldest);
      }
    }
  };

  const cached = (id: string): CachedComparison => {
    const entry = cache.get(id);
    if (entry === undefined) {
      throw new AppError(
        ErrorCode.comparisonExpired,
        404,
        'This comparison has expired. Compare again.',
      );
    }
    return entry;
  };

  const lookup = (
    id: string,
    fileIndex: number,
  ): { entry: CachedComparison; file: ChangedFile } => {
    const entry = cached(id);
    const file = entry.files[fileIndex];
    if (file === undefined) {
      throw new AppError(ErrorCode.notFound, 404, 'No such file in this comparison');
    }
    return { entry, file };
  };

  return {
    compare: async ({ repoPath, base, head, baseLabel, headLabel }) => {
      const [baseSha, headSha] = await Promise.all([
        resolveCommit(git, repoPath, base),
        resolveCommit(git, repoPath, head),
      ]);
      const mergeBase = await findMergeBase(git, repoPath, baseSha, headSha);
      const range = [mergeBase, headSha];
      const [nameStatus, numstat] = await Promise.all([
        git.run(repoPath, ['diff', ...DIFF_FLAGS, '-z', '--name-status', ...range]),
        git.run(repoPath, ['diff', ...DIFF_FLAGS, '-z', '--numstat', ...range]),
      ]);
      const files = joinChangedFiles(nameStatus, numstat);
      const id = comparisonId(repoPath, mergeBase, headSha);
      remember(id, { repoPath, mergeBase, head: headSha, files });
      return {
        id,
        repo: basename(repoPath),
        repoPath,
        base: { name: baseLabel ?? base.trim(), sha: baseSha },
        head: { name: headLabel ?? head.trim(), sha: headSha },
        files,
      };
    },
    changedFile: async (id, fileIndex) => lookup(id, fileIndex).file,
    headSha: async (id) => cached(id).head,
    changedFiles: async (id) => cached(id).files,
    details: async (id) => {
      const { repoPath, mergeBase, head, files } = cached(id);
      return { repoPath, mergeBase, head, files };
    },
    fileDiff: async (id, fileIndex) => {
      const { entry, file } = lookup(id, fileIndex);
      const paths = file.oldPath === null ? [file.path] : [file.oldPath, file.path];
      const output = await git.run(entry.repoPath, [
        'diff',
        ...DIFF_FLAGS,
        '-U3',
        entry.mergeBase,
        entry.head,
        '--',
        ...paths,
      ]);
      return parseUnifiedDiff(output);
    },
  };
};
