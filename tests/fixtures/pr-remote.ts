import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { makeRepo, runGit } from './repo-builder.ts';
import type { TestRepo } from './repo-builder.ts';

export const GITHUB_SSH_URL = 'git@github.com:acme/platform.git';
export const PR_NUMBER = 42;

export interface PrSetup {
  /** The reviewer's local clone, inside the app's root, with `origin` = the GitHub SSH URL. */
  clone: string;
  upstream: TestRepo;
  baseSha: string;
  headSha: string;
  /** Adds a commit to the PR head on the remote, as a push would. */
  pushToPr: (files: Record<string, string>) => Promise<string>;
  remove: () => Promise<void>;
}

/**
 * A GitHub-like setup without the network: a bare "remote" holding `refs/pull/42/head`, and a
 * local clone whose `origin` is a GitHub SSH URL that Git rewrites (`insteadOf`) to the bare
 * repository. The app sees an SSH remote; Git fetches from the local bare repository.
 */
export const makePrSetup = async (root: string): Promise<PrSetup> => {
  const upstream = await makeRepo();
  const baseSha = await upstream.commit('base', {
    'src/money.ts': 'export const toCents = (amount: number) => Math.round(amount * 100);\n',
  });
  upstream.git('switch', '--quiet', '-c', 'feature');
  const headSha = await upstream.commit('currency', {
    'src/money.ts': 'export const toMinorUnits = (amount: number) => Math.round(amount * 100);\n',
    'src/currency.ts': "export type Currency = 'USD' | 'EUR';\n",
  });
  // The remote's default branch is the upstream's current branch when cloned: make it main.
  upstream.git('switch', '--quiet', 'main');
  const bareParent = await realpath(await mkdtemp(join(tmpdir(), 'af-bare-')));
  const bare = join(bareParent, 'platform.git');
  runGit(bareParent, ['clone', '--quiet', '--bare', upstream.path, bare]);
  runGit(bare, ['update-ref', `refs/pull/${PR_NUMBER}/head`, headSha]);

  const clone = join(root, 'platform');
  runGit(root, ['clone', '--quiet', '--branch', 'main', bare, clone]);
  runGit(clone, ['remote', 'set-url', 'origin', GITHUB_SSH_URL]);
  runGit(clone, ['config', `url.${pathToFileURL(bare).href}.insteadOf`, GITHUB_SSH_URL]);

  return {
    clone,
    upstream,
    baseSha,
    headSha,
    pushToPr: async (files) => {
      upstream.git('switch', '--quiet', 'feature');
      const sha = await upstream.commit('more work', files);
      runGit(bare, ['fetch', '--quiet', upstream.path, 'feature:feature']);
      runGit(bare, ['update-ref', `refs/pull/${PR_NUMBER}/head`, sha]);
      return sha;
    },
    remove: async () => {
      await upstream.remove();
      await rm(bareParent, { recursive: true, force: true });
    },
  };
};
