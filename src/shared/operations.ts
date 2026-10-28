import { z } from 'zod';

import { comparisonIdSchema, comparisonSchema, fileDiffSchema } from './comparison.ts';
import { dependencyMapSchema } from './map.ts';
import {
  fetchedPullRequestSchema,
  ghStatusSchema,
  prNumberSchema,
  prRefSchema,
  pullRequestSchema,
} from './pull-request.ts';
import { draftInputSchema, MAX_COMMENT_LENGTH, reviewStateSchema } from './review.ts';
import { submissionResultSchema, submissionSummarySchema } from './submission.ts';
import {
  foundCloneSchema,
  openedRepositorySchema,
  recentRepositorySchema,
  refListSchema,
  repositoryPathSchema,
} from './repository.ts';

const fileIndexSchema = z.number().int().nonnegative();
/** Which review an operation is about: the comparison's, or the pull request's once known. */
const reviewTarget = { comparisonId: comparisonIdSchema, pr: prRefSchema.nullable() };
const labelSchema = z.string().min(1).max(100).optional();
const remoteNameSchema = z.string().regex(/^[A-Za-z0-9._/-]{1,100}$/);

export const operations = {
  ping: {
    input: z.object({}).strict(),
    output: z.object({ pong: z.literal(true) }),
  },
  appInfo: {
    input: z.object({}).strict(),
    output: z.object({
      fixture: z.enum(['small', 'large']).nullable(),
      roots: z.array(z.string()),
    }),
  },
  openRepo: {
    input: z.object({ path: repositoryPathSchema }).strict(),
    output: openedRepositorySchema,
  },
  recentRepos: {
    input: z.object({}).strict(),
    output: z.object({ repos: z.array(recentRepositorySchema) }),
  },
  listRefs: {
    input: z.object({ repo: repositoryPathSchema }).strict(),
    output: refListSchema,
  },
  findClones: {
    input: z.object({ owner: prRefSchema.shape.owner, name: prRefSchema.shape.name }).strict(),
    output: z.object({ clones: z.array(foundCloneSchema) }),
  },
  ghStatus: {
    input: z.object({}).strict(),
    output: ghStatusSchema,
  },
  readPr: {
    input: z
      .object({ repo: repositoryPathSchema, remote: remoteNameSchema, number: prNumberSchema })
      .strict(),
    output: pullRequestSchema,
  },
  fetchPr: {
    input: z
      .object({
        repo: repositoryPathSchema,
        remote: remoteNameSchema,
        number: prNumberSchema,
        baseBranch: z.string().min(1).max(255).nullable(),
      })
      .strict(),
    output: fetchedPullRequestSchema,
  },
  compare: {
    input: z.discriminatedUnion('source', [
      z.object({ source: z.literal('fixture') }).strict(),
      z
        .object({
          source: z.literal('git'),
          repo: repositoryPathSchema,
          base: z.string().min(1).max(255),
          head: z.string().min(1).max(255),
          /** Shown instead of the refs, e.g. `main` and `#42` when the refs are SHAs. */
          baseLabel: labelSchema,
          headLabel: labelSchema,
        })
        .strict(),
    ]),
    output: comparisonSchema,
  },
  fileDiff: {
    input: z.object({ comparisonId: comparisonIdSchema, fileIndex: fileIndexSchema }).strict(),
    output: fileDiffSchema,
  },
  reviewMarks: {
    input: z.object({ comparisonId: comparisonIdSchema }).strict(),
    output: z.object({ paths: z.array(z.string()) }),
  },
  loadReview: {
    input: z.object(reviewTarget).strict(),
    output: reviewStateSchema,
  },
  saveDraft: {
    input: z.object({ ...reviewTarget, draft: draftInputSchema }).strict(),
    output: z.object({ review: reviewStateSchema, draftId: z.uuid() }),
  },
  deleteDraft: {
    input: z.object({ ...reviewTarget, draftId: z.uuid() }).strict(),
    output: reviewStateSchema,
  },
  saveOverall: {
    input: z.object({ ...reviewTarget, body: z.string().max(MAX_COMMENT_LENGTH) }).strict(),
    output: reviewStateSchema,
  },
  prepareSubmission: {
    input: z.object({ comparisonId: comparisonIdSchema, pr: prRefSchema }).strict(),
    output: submissionSummarySchema,
  },
  submitReview: {
    input: z
      .object({
        comparisonId: comparisonIdSchema,
        pr: prRefSchema,
        prepId: z.string().regex(/^[0-9a-f]{64}$/),
      })
      .strict(),
    output: submissionResultSchema,
  },
  checkReviews: {
    input: z
      .object({ comparisonId: comparisonIdSchema, pr: prRefSchema, attemptId: z.uuid() })
      .strict(),
    output: submissionResultSchema,
  },
  dependencyMap: {
    input: z.object({ comparisonId: comparisonIdSchema }).strict(),
    output: dependencyMapSchema,
  },
  setReviewed: {
    input: z
      .object({
        comparisonId: comparisonIdSchema,
        fileIndex: fileIndexSchema,
        reviewed: z.boolean(),
      })
      .strict(),
    output: z.object({ paths: z.array(z.string()) }),
  },
} as const;

export type Operations = typeof operations;
export type OperationName = keyof Operations;
export type OperationInput<N extends OperationName> = z.infer<Operations[N]['input']>;
export type OperationOutput<N extends OperationName> = z.infer<Operations[N]['output']>;

export const isOperationName = (name: string): name is OperationName =>
  Object.hasOwn(operations, name);
