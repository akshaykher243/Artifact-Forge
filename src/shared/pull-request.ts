import { z } from 'zod';

/** A pull request number: a positive whole number. */
export const prNumberSchema = z.number().int().min(1).max(1_000_000_000);

/** An owner or repository name; never `.` or `..`, since it becomes part of an API path. */
const segmentSchema = z
  .string()
  .regex(/^[A-Za-z0-9._-]{1,100}$/)
  .refine((segment) => !/^\.+$/.test(segment), 'Not a valid name');

/** Identifies a GitHub pull request; owner and name come from the remote's URL. */
export const prRefSchema = z.object({
  owner: segmentSchema,
  name: segmentSchema,
  number: prNumberSchema,
});

export type PrRef = z.infer<typeof prRefSchema>;

export const pullRequestSchema = prRefSchema.extend({
  title: z.string(),
  state: z.enum(['OPEN', 'CLOSED', 'MERGED']),
  isDraft: z.boolean(),
  url: z.string(),
  baseRefName: z.string(),
  headRefName: z.string(),
  baseRefOid: z.string(),
  headRefOid: z.string(),
  isCrossRepository: z.boolean(),
  author: z.string(),
});

export type PullRequest = z.infer<typeof pullRequestSchema>;

export const ghStatusSchema = z.object({
  installed: z.boolean(),
  signedIn: z.boolean(),
  login: z.string().nullable(),
});

export type GhStatus = z.infer<typeof ghStatusSchema>;

export const fetchedPullRequestSchema = z.object({
  baseBranch: z.string(),
  baseSha: z.string(),
  headSha: z.string(),
});

const PR_LINK =
  /^https?:\/\/(?:www\.)?github\.com\/([A-Za-z0-9._-]{1,100})\/([A-Za-z0-9._-]{1,100})\/pull\/(\d{1,10})(?:[/?#].*)?$/i;

export type LinkReading =
  { kind: 'pullRequest'; pr: PrRef } | { kind: 'otherLink' } | { kind: 'notALink' };

/**
 * Tells a GitHub pull request link from any other link and from a folder path. Anything after
 * the number (`/files`, a query, a fragment) is ignored.
 */
export const readPrLink = (input: string): LinkReading => {
  const text = input.trim();
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(text)) {
    return { kind: 'notALink' };
  }
  const match = PR_LINK.exec(text);
  const parsed = prRefSchema.safeParse({
    owner: match?.[1],
    name: match?.[2],
    number: Number(match?.[3]),
  });
  return parsed.success ? { kind: 'pullRequest', pr: parsed.data } : { kind: 'otherLink' };
};
