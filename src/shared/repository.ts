import { z } from 'zod';

const namedRefSchema = z.object({ name: z.string(), sha: z.string() });

export const remoteSummarySchema = z.object({
  name: z.string(),
  url: z.string(),
  github: z.object({ owner: z.string(), name: z.string() }).nullable(),
  ssh: z.boolean(),
});

export type RemoteSummary = z.infer<typeof remoteSummarySchema>;

export const refListSchema = z.object({
  /** The checked-out branch, or null when HEAD is detached. */
  head: z.string().nullable(),
  branches: z.array(namedRefSchema),
  remoteBranches: z.array(namedRefSchema),
  tags: z.array(namedRefSchema),
  remotes: z.array(remoteSummarySchema),
});

export type RefList = z.infer<typeof refListSchema>;

export const openedRepositorySchema = z.object({ path: z.string(), name: z.string() });

export type OpenedRepository = z.infer<typeof openedRepositorySchema>;

export const recentRepositorySchema = openedRepositorySchema.extend({
  openedAt: z.string(),
});

export type RecentRepository = z.infer<typeof recentRepositorySchema>;

/** A local clone of a pull request's repository, and the remote that points at GitHub. */
export const foundCloneSchema = z.object({
  path: z.string(),
  name: z.string(),
  remote: z.string(),
});

export type FoundClone = z.infer<typeof foundCloneSchema>;

/** Absolute or `~/` path typed by the reviewer; the server resolves and confines it. */
export const repositoryPathSchema = z.string().min(1).max(4096);
