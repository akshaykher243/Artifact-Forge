import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findBinary } from '../../../../src/server/config.ts';
import { createGitClient } from '../../../../src/server/git/git-client.ts';
import type { GitClient } from '../../../../src/server/git/git-client.ts';
import { fetchPullRequest } from '../../../../src/server/git/pr-fetch.ts';
import { createProcessRunner } from '../../../../src/server/security/run-process.ts';
import { makePrSetup, PR_NUMBER } from '../../../fixtures/pr-remote.ts';
import type { PrSetup } from '../../../fixtures/pr-remote.ts';

/** The real git client, recording the subcommand of every call. */
const recordingGit = async (): Promise<{ git: GitClient; commands: string[] }> => {
  const binary = await findBinary('git', process.env.PATH ?? '');
  const runProcess = createProcessRunner({
    env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '' },
    log: () => undefined,
  });
  const git = createGitClient(runProcess, binary ?? 'git');
  const commands: string[] = [];
  const record = (args: readonly string[]) => commands.push(args[0] ?? '');
  return {
    commands,
    git: {
      run: (repo, args, timeoutMs) => (record(args), git.run(repo, args, timeoutMs)),
      exec: (repo, args, timeoutMs) => (record(args), git.exec(repo, args, timeoutMs)),
      feed: (repo, args, input) => (record(args), git.feed(repo, args, input)),
    },
  };
};

describe('fetchPullRequest', () => {
  let root: string;
  let setup: PrSetup;

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'af-pr-fetch-')));
    setup = await makePrSetup(root);
  });

  afterEach(async () => {
    await setup.remove();
    await rm(root, { recursive: true, force: true });
  });

  const request = { remote: 'origin', number: PR_NUMBER, baseBranch: 'main' };

  it('downloads the PR commits the clone does not have yet', async () => {
    const { git, commands } = await recordingGit();
    const unseen = await setup.pushToPr({ 'src/more.ts': 'export const more = 1;\n' });

    const fetched = await fetchPullRequest(git, { repoPath: setup.clone, ...request });

    expect(fetched).toEqual({ baseBranch: 'main', baseSha: setup.baseSha, headSha: unseen });
    expect(commands).toContain('fetch');
  });

  it('skips the download when the clone already has both commits, but still checks the tips', async () => {
    const { git, commands } = await recordingGit();
    await fetchPullRequest(git, { repoPath: setup.clone, ...request });
    commands.length = 0;

    const again = await fetchPullRequest(git, { repoPath: setup.clone, ...request });

    expect(again.headSha).toBe(setup.headSha);
    expect(commands).toContain('ls-remote');
    expect(commands).not.toContain('fetch');
  });

  it('downloads again after a new push to the PR', async () => {
    const { git, commands } = await recordingGit();
    await fetchPullRequest(git, { repoPath: setup.clone, ...request });
    const pushed = await setup.pushToPr({ 'src/more.ts': 'export const more = 1;\n' });
    commands.length = 0;

    const again = await fetchPullRequest(git, { repoPath: setup.clone, ...request });

    expect(again.headSha).toBe(pushed);
    expect(commands).toContain('fetch');
  });
});
