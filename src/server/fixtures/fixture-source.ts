import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { z } from 'zod';

import { diffRowSchema, FileStatus } from '../../shared/comparison.ts';
import type { ChangedFile, Comparison } from '../../shared/comparison.ts';
import { ErrorCode } from '../../shared/envelope.ts';
import type { ComparisonSource } from '../comparison-source.ts';
import { AppError, StartupError } from '../errors.ts';

export const FIXTURE_NAMES = ['small', 'large'] as const;
export type FixtureName = (typeof FIXTURE_NAMES)[number];

const FIXTURES_DIR = join(import.meta.dirname, '..', '..', '..', 'tests', 'fixtures');

export const fixturePath = (name: FixtureName): string => join(FIXTURES_DIR, `${name}.json`);

/** The artifact's sample-data shape, as extracted into tests/fixtures. */
const artifactDataSchema = z.object({
  meta: z.object({
    repo: z.string(),
    base: z.string(),
    head: z.string(),
    baseSha: z.string(),
    headSha: z.string(),
  }),
  files: z.array(
    z.object({
      p: z.string(),
      a: z.number().int().nonnegative(),
      r: z.number().int().nonnegative(),
      st: z.enum([FileStatus.added, FileStatus.modified, FileStatus.renamed]),
      old: z.string().nullable(),
    }),
  ),
  fileDiffs: z.record(z.string(), z.array(diffRowSchema)),
});

type ArtifactData = z.infer<typeof artifactDataSchema>;

const toChangedFile = (file: ArtifactData['files'][number]): ChangedFile => ({
  path: file.p,
  oldPath: file.old,
  status: file.st,
  additions: file.a,
  deletions: file.r,
  binary: false,
});

const toComparison = (name: FixtureName, data: ArtifactData): Comparison => ({
  id: `fixture:${name}`,
  repo: data.meta.repo,
  repoPath: null,
  base: { name: data.meta.base, sha: data.meta.baseSha },
  head: { name: data.meta.head, sha: data.meta.headSha },
  files: data.files.map(toChangedFile),
});

const readFixture = async (name: FixtureName): Promise<ArtifactData> => {
  const path = fixturePath(name);
  try {
    return artifactDataSchema.parse(JSON.parse(await readFile(path, 'utf8')));
  } catch {
    throw new StartupError(`Fixture "${name}" is missing or invalid at ${path}`);
  }
};

/** Serves one of the artifact's sample datasets instead of a Git repository. */
export const createFixtureSource = async (name: FixtureName): Promise<ComparisonSource> => {
  const data = await readFixture(name);
  const comparison = toComparison(name, data);
  const changedFile = async (comparisonId: string, fileIndex: number): Promise<ChangedFile> => {
    const file = comparisonId === comparison.id ? comparison.files[fileIndex] : undefined;
    if (file === undefined) {
      throw new AppError(ErrorCode.notFound, 404, 'No such file in this comparison');
    }
    return file;
  };
  return {
    compare: async () => comparison,
    changedFile,
    changedFiles: async (comparisonId) => {
      await changedFile(comparisonId, 0);
      return comparison.files;
    },
    headSha: async (comparisonId) => {
      await changedFile(comparisonId, 0);
      return comparison.head.sha;
    },
    fileDiff: async (comparisonId, fileIndex) => {
      const file = await changedFile(comparisonId, fileIndex);
      return { kind: 'rows', rows: data.fileDiffs[file.path] ?? [] };
    },
  };
};
