import type { DiffRow } from '../../shared/comparison.ts';
import { FileStatus } from '../../shared/comparison.ts';
import { isSourcePath } from '../../shared/map.ts';
import type { DependencyMap } from '../../shared/map.ts';
import type { GitClient } from '../git/git-client.ts';
import { GitError } from '../git/git-client.ts';
import type { GitComparisons } from '../git/git-comparisons.ts';
import { maskSecrets } from '../security/mask-secrets.ts';
import type { ChangedSourceFile } from './changes.ts';
import { AnalysisFailure, runAnalysis } from './run-analysis.ts';
import { readFiles, readSnapshot } from './snapshot.ts';

/** Analyses kept, newest last; an older one is analysed again when asked for. */
const CACHE_SIZE = 8;

export interface MapService {
  dependencyMap: (comparisonId: string) => Promise<DependencyMap>;
}

export interface MapServiceDependencies {
  git: GitClient;
  gitComparisons: GitComparisons;
  /** The artifact's own map for sample-data comparisons, or null when not serving them. */
  fixtureMap: DependencyMap | null;
}

const rowsOf = async (
  comparisons: GitComparisons,
  id: string,
  index: number,
): Promise<DiffRow[]> => {
  const diff = await comparisons.fileDiff(id, index);
  return diff.kind === 'rows' ? diff.rows : [];
};

export const createMapService = ({
  git,
  gitComparisons,
  fixtureMap,
}: MapServiceDependencies): MapService => {
  const cache = new Map<string, Promise<DependencyMap>>();

  const analyse = async (comparisonId: string): Promise<DependencyMap> => {
    const { repoPath, mergeBase, head, files } = await gitComparisons.details(comparisonId);
    const changed = files
      .map((file, index) => ({ file, index }))
      .filter(
        ({ file }) => file.status !== FileStatus.deleted && !file.binary && isSourcePath(file.path),
      );
    if (changed.length === 0) {
      return { state: 'noSource' };
    }
    const snapshot = await readSnapshot(git, repoPath, head);
    if (snapshot.state === 'tooLarge') {
      return snapshot;
    }
    const basePaths = changed.map(({ file }) => file.oldPath ?? file.path);
    const baseTexts = await readFiles(git, repoPath, mergeBase, basePaths);
    const changedSources: ChangedSourceFile[] = await Promise.all(
      changed.map(async ({ file, index }) => ({
        path: file.path,
        baseText:
          file.status === FileStatus.added
            ? null
            : (baseTexts.get(file.oldPath ?? file.path) ?? null),
        rows: await rowsOf(gitComparisons, comparisonId, index),
      })),
    );
    const result = await runAnalysis({
      files: [...snapshot.files],
      tsconfig: snapshot.tsconfig,
      changed: changedSources,
    });
    return { state: 'ready', sourceFileCount: snapshot.sourceFileCount, ...result };
  };

  const safely = async (comparisonId: string): Promise<DependencyMap> => {
    try {
      return await analyse(comparisonId);
    } catch (error) {
      if (error instanceof AnalysisFailure || error instanceof GitError) {
        return { state: 'failed', message: maskSecrets(error.message) };
      }
      throw error;
    }
  };

  return {
    dependencyMap: (comparisonId) => {
      if (comparisonId.startsWith('fixture:') && fixtureMap !== null) {
        return Promise.resolve(fixtureMap);
      }
      const existing = cache.get(comparisonId);
      if (existing !== undefined) {
        return existing;
      }
      const pending = safely(comparisonId);
      cache.set(comparisonId, pending);
      // A failed lookup (e.g. an expired comparison) must not stay cached.
      pending.catch(() => cache.delete(comparisonId));
      if (cache.size > CACHE_SIZE) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) {
          cache.delete(oldest);
        }
      }
      return pending;
    },
  };
};
