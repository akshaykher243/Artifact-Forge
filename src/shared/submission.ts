import { z } from 'zod';

import { prRefSchema } from './pull-request.ts';
import { reviewStateSchema } from './review.ts';

/** What the confirmation shows; `prepId` binds the confirmation to the exact request body. */
export const submissionSummarySchema = prRefSchema.extend({
  prepId: z.string(),
  title: z.string(),
  state: z.enum(['OPEN', 'CLOSED', 'MERGED']),
  baseRefName: z.string(),
  headRefName: z.string(),
  headSha: z.string(),
  action: z.literal('Comment'),
  login: z.string(),
  inlineCount: z.number().int().nonnegative(),
  hasOverall: z.boolean(),
  outdatedCount: z.number().int().nonnegative(),
});

export type SubmissionSummary = z.infer<typeof submissionSummarySchema>;

export const submissionResultSchema = z.object({
  outcome: z.enum(['submitted', 'failed', 'unknown']),
  attemptId: z.uuid(),
  reviewUrl: z.string().nullable(),
  message: z.string().nullable(),
  review: reviewStateSchema,
});

export type SubmissionResult = z.infer<typeof submissionResultSchema>;
