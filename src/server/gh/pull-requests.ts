import { z } from 'zod';

import { ErrorCode } from '../../shared/envelope.ts';
import type { GhStatus, PrRef, PullRequest } from '../../shared/pull-request.ts';
import { AppError } from '../errors.ts';
import type { GhClient } from './gh-client.ts';
import { GITHUB_HOST } from './gh-client.ts';

const authStatusSchema = z.object({
  hosts: z.record(
    z.string(),
    z.array(z.object({ state: z.string(), active: z.boolean(), login: z.string() })),
  ),
});

const UNEXPECTED_OUTPUT = 'gh returned output in an unexpected shape';

const parseJson = (output: string): unknown => {
  try {
    return JSON.parse(output);
  } catch {
    throw new AppError(ErrorCode.ghFailed, 502, UNEXPECTED_OUTPUT);
  }
};

/** Whether gh is installed and signed in to github.com. Never asks for or reads the token. */
export const readGhStatus = async (gh: GhClient): Promise<GhStatus> => {
  if (!gh.installed) {
    return { installed: false, signedIn: false, login: null };
  }
  const output = await gh.run(['auth', 'status', '--json', 'hosts', '--hostname', GITHUB_HOST]);
  const parsed = authStatusSchema.safeParse(parseJson(output));
  if (!parsed.success) {
    throw new AppError(ErrorCode.ghFailed, 502, UNEXPECTED_OUTPUT);
  }
  const accounts = parsed.data.hosts[GITHUB_HOST] ?? [];
  const active = accounts.find((account) => account.active && account.state === 'success');
  return { installed: true, signedIn: active !== undefined, login: active?.login ?? null };
};

const PR_FIELDS = [
  'number',
  'title',
  'state',
  'isDraft',
  'url',
  'baseRefName',
  'headRefName',
  'baseRefOid',
  'headRefOid',
  'isCrossRepository',
  'author',
].join(',');

const prViewSchema = z.object({
  number: z.number(),
  title: z.string(),
  state: z.enum(['OPEN', 'CLOSED', 'MERGED']),
  isDraft: z.boolean(),
  url: z.string(),
  baseRefName: z.string(),
  headRefName: z.string(),
  baseRefOid: z.string(),
  headRefOid: z.string(),
  isCrossRepository: z.boolean(),
  author: z.object({ login: z.string() }),
});

const parsePullRequest = (pr: PrRef, output: string): PullRequest => {
  const result = prViewSchema.safeParse(parseJson(output));
  if (!result.success || result.data.number !== pr.number) {
    throw new AppError(
      ErrorCode.ghFailed,
      502,
      'gh returned pull request details in an unexpected shape',
    );
  }
  return { ...pr, ...result.data, author: result.data.author.login };
};

/** Reads the details needed to confirm the target pull request. */
export const readPullRequest = async (gh: GhClient, pr: PrRef): Promise<PullRequest> => {
  const output = await gh.run([
    'pr',
    'view',
    String(pr.number),
    '--repo',
    `${GITHUB_HOST}/${pr.owner}/${pr.name}`,
    '--json',
    PR_FIELDS,
  ]);
  return parsePullRequest(pr, output);
};
