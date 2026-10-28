import { z } from 'zod';

export const MAX_COMMENT_LENGTH = 65_536;

export const DraftState = {
  draft: 'draft',
  outdated: 'outdated',
  submitted: 'submitted',
} as const;

export type DraftState = (typeof DraftState)[keyof typeof DraftState];

/** `old` is the base side (removed and context lines), `new` the head side (added and context). */
export const draftSideSchema = z.enum(['old', 'new']);

export type DraftSide = z.infer<typeof draftSideSchema>;

const commentBodySchema = z
  .string()
  .max(MAX_COMMENT_LENGTH)
  .refine((body) => body.trim() !== '', 'A comment needs some text');

export const draftSchema = z.object({
  id: z.uuid(),
  path: z.string(),
  side: draftSideSchema,
  startLine: z.number().int().positive(),
  endLine: z.number().int().positive(),
  /** The head commit the lines were anchored against. */
  headSha: z.string(),
  /** Text of the anchored lines, used to re-check the anchor when the head changes. */
  anchorText: z.array(z.string()),
  body: commentBodySchema,
  state: z.enum(DraftState),
  reviewUrl: z.string().nullable(),
  updatedAt: z.string(),
});

export type Draft = z.infer<typeof draftSchema>;

export const SubmissionState = {
  submitting: 'submitting',
  submitted: 'submitted',
  failed: 'failed',
  unknown: 'unknown',
} as const;

export type SubmissionState = (typeof SubmissionState)[keyof typeof SubmissionState];

/** One attempt to post the review, recorded before gh runs so a crash leaves a trace. */
export const submissionSchema = z.object({
  attemptId: z.uuid(),
  startedAt: z.string(),
  state: z.enum(SubmissionState),
  /** Hash of the exact request body sent. */
  bodyHash: z.string(),
  /** The overall comment that was sent, used to recognise the review on GitHub later. */
  overall: z.string(),
  draftIds: z.array(z.uuid()),
  reviewUrl: z.string().nullable(),
  message: z.string().nullable(),
  /** When the reviewer last looked for this attempt on GitHub (outcome unknown only). */
  checkedAt: z.string().nullable().default(null),
});

export type Submission = z.infer<typeof submissionSchema>;

export const reviewStateSchema = z.object({
  version: z.literal(1),
  overall: z.string().max(MAX_COMMENT_LENGTH),
  drafts: z.array(draftSchema),
  submissions: z.array(submissionSchema).default([]),
});

export type ReviewState = z.infer<typeof reviewStateSchema>;

export const EMPTY_REVIEW: ReviewState = { version: 1, overall: '', drafts: [], submissions: [] };

export const draftInputSchema = z
  .object({
    /** Omitted for a new draft. */
    id: z.uuid().optional(),
    fileIndex: z.number().int().nonnegative(),
    side: draftSideSchema,
    startLine: z.number().int().positive(),
    endLine: z.number().int().positive(),
    body: commentBodySchema,
  })
  .strict()
  .refine((input) => input.endLine >= input.startLine, 'A range must end after it starts');

export type DraftInput = z.infer<typeof draftInputSchema>;
