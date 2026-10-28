import { z } from 'zod';

export const FileStatus = {
  added: 'added',
  modified: 'modified',
  deleted: 'deleted',
  renamed: 'renamed',
} as const;

export type FileStatus = (typeof FileStatus)[keyof typeof FileStatus];

/**
 * One diff line in the artifact's own shape: sign, old line, new line, text.
 * Sign `~` is a fold row whose text reads "<n> unchanged lines"; rows between two
 * fold rows belong to the same hunk.
 */
export const diffRowSchema = z.tuple([
  z.enum([' ', '+', '-', '~']),
  z.number().int().positive().nullable(),
  z.number().int().positive().nullable(),
  z.string(),
]);

export type DiffRow = z.infer<typeof diffRowSchema>;

export const changedFileSchema = z.object({
  path: z.string(),
  oldPath: z.string().nullable(),
  status: z.enum(FileStatus),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative(),
  binary: z.boolean(),
});

export type ChangedFile = z.infer<typeof changedFileSchema>;

/** `git:<hex>` for a repository comparison, `fixture:<name>` for the artifact's sample data. */
export const comparisonIdSchema = z.string().regex(/^(git|fixture):[a-z0-9]{1,64}$/);

export const comparisonSchema = z.object({
  id: comparisonIdSchema,
  /** Display name of the repository. */
  repo: z.string(),
  /** Absolute path of the local repository; null for the artifact's sample data. */
  repoPath: z.string().nullable(),
  base: z.object({ name: z.string(), sha: z.string() }),
  head: z.object({ name: z.string(), sha: z.string() }),
  files: z.array(changedFileSchema),
});

export type Comparison = z.infer<typeof comparisonSchema>;

export const fileDiffSchema = z.union([
  z.object({ kind: z.literal('rows'), rows: z.array(diffRowSchema) }),
  z.object({ kind: z.literal('notice'), notice: z.string() }),
]);

export type FileDiff = z.infer<typeof fileDiffSchema>;
