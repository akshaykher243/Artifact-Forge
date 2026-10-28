import { access, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { authStatusRule, createFakeGh, prViewRule } from '../../fixtures/fake-gh.ts';
import type { FakeGh } from '../../fixtures/fake-gh.ts';
import { makePrSetup, PR_NUMBER } from '../../fixtures/pr-remote.ts';
import type { PrSetup } from '../../fixtures/pr-remote.ts';
import { runGit, snapshotRepo } from '../../fixtures/repo-builder.ts';
import { buildTestApp, callOp } from '../../fixtures/test-app.ts';

describe('pull requests', () => {
  let root: string;
  let setup: PrSetup;
  let gh: FakeGh;
  let app: FastifyInstance;

  // Built once: tests only add uniquely named remotes, and each test that checks repository
  // state compares its own before and after.
  beforeAll(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'af-root-')));
    setup = await makePrSetup(root);
  });

  afterAll(async () => {
    await setup.remove();
    await rm(root, { recursive: true, force: true });
  });

  beforeEach(async () => {
    gh = await createFakeGh();
    app = await buildTestApp({ root, ghHome: gh.home });
  });

  afterEach(async () => {
    await app.close();
    await gh.remove();
  });

  describe('GitHub CLI readiness', () => {
    it('uses the fake gh, never a real login', async () => {
      await gh.setRules([authStatusRule('octo-reviewer')]);

      const { data } = (await callOp(app, 'ghStatus')).json();

      expect(data).toEqual({ installed: true, signedIn: true, login: 'octo-reviewer' });
      expect((await gh.calls()).map((call) => call.args)).toEqual([
        ['auth', 'status', '--json', 'hosts', '--hostname', 'github.com'],
      ]);
    });

    it('Not signed in: reports no account and never asks for a token', async () => {
      await gh.setRules([authStatusRule(null)]);

      const { data } = (await callOp(app, 'ghStatus')).json();

      expect(data).toEqual({ installed: true, signedIn: false, login: null });
      expect(JSON.stringify(await gh.calls())).not.toContain('--show-token');
    });

    it('Not installed: reports it when gh is not on PATH', async () => {
      const bare = await buildTestApp({ root, ghHome: gh.home, path: '/usr/bin:/bin' });

      const { data } = (await callOp(bare, 'ghStatus')).json();

      expect(data).toEqual({ installed: false, signedIn: false, login: null });
      await bare.close();
    });
  });

  describe('Identify the target PR', () => {
    const readPr = (number: unknown) =>
      callOp(app, 'readPr', { payload: { repo: setup.clone, remote: 'origin', number } });

    it('Valid PR: reads it with the repository taken from the remote URL', async () => {
      await gh.setRules([
        prViewRule({ number: PR_NUMBER, baseRefOid: setup.baseSha, headRefOid: setup.headSha }),
      ]);

      const { data } = (await readPr(PR_NUMBER)).json();

      expect(data).toMatchObject({
        owner: 'acme',
        name: 'platform',
        number: PR_NUMBER,
        title: 'Add multi-currency support',
        state: 'OPEN',
        headRefOid: setup.headSha,
        author: 'octo-author',
      });
      const [call] = await gh.calls();
      expect(call?.args.slice(0, 5)).toEqual([
        'pr',
        'view',
        '42',
        '--repo',
        'github.com/acme/platform',
      ]);
    });

    it.each([0, -1, 1.5, '42', null])(
      'Invalid number: rejects %j without calling gh',
      async (number) => {
        const response = await readPr(number);

        expect(response.statusCode).toBe(400);
        expect(await gh.calls()).toEqual([]);
      },
    );

    it('Not found or no access: shows gh’s message', async () => {
      await gh.setRules([
        {
          args: ['pr', 'view'],
          exitCode: 1,
          stderr: 'GraphQL: Could not resolve to a PullRequest with the number of 99.',
        },
      ]);

      const response = await readPr(99);

      expect(response.json().error).toEqual({
        code: 'gh_failed',
        message: 'GraphQL: Could not resolve to a PullRequest with the number of 99.',
      });
    });

    it('Token in error output: masks a token-shaped string in gh’s message', async () => {
      const token = `gho_${'A1'.repeat(20)}`;
      await gh.setRules([
        { args: ['pr', 'view'], exitCode: 1, stderr: `HTTP 401 for token ${token}` },
      ]);

      const response = await readPr(PR_NUMBER);

      expect(response.json().error.message).toBe('HTTP 401 for token [masked]');
    });

    it('reports unexpected gh output as an error, not as a pull request', async () => {
      await gh.setRules([{ args: ['pr', 'view'], stdout: 'not json' }]);

      const response = await readPr(PR_NUMBER);

      expect(response.json().error.code).toBe('gh_failed');
    });

    it('refuses a remote that is not on GitHub', async () => {
      runGit(setup.clone, ['remote', 'add', 'elsewhere', 'git@gitlab.com:acme/platform.git']);

      const response = await callOp(app, 'readPr', {
        payload: { repo: setup.clone, remote: 'elsewhere', number: PR_NUMBER },
      });

      expect(response.json().error.code).toBe('remote_not_found');
      expect(await gh.calls()).toEqual([]);
    });
  });

  describe('Fetch a PR’s commits over SSH on request', () => {
    const fetchPr = (payload: Record<string, unknown>) =>
      callOp(app, 'fetchPr', {
        payload: {
          repo: setup.clone,
          remote: 'origin',
          number: PR_NUMBER,
          baseBranch: 'main',
          ...payload,
        },
      });

    it('Fetch succeeds: brings the commits and writes no ref, FETCH_HEAD or config', async () => {
      const before = await snapshotRepo(setup.clone);

      const response = await fetchPr({});

      expect(response.json().data).toEqual({
        baseBranch: 'main',
        baseSha: setup.baseSha,
        headSha: setup.headSha,
      });
      expect(runGit(setup.clone, ['cat-file', '-t', setup.headSha])).toBe('commit');
      expect(await snapshotRepo(setup.clone)).toEqual(before);
      await expect(access(join(setup.clone, '.git', 'FETCH_HEAD'))).rejects.toThrow();
    });

    it('uses the remote’s default branch when the base branch is not known', async () => {
      const { data } = (await fetchPr({ baseBranch: null })).json();

      expect(data.baseBranch).toBe('main');
    });

    it('the fetched commits can be compared like the pull request', async () => {
      const { data: fetched } = (await fetchPr({})).json();

      const { data } = (
        await callOp(app, 'compare', {
          payload: {
            source: 'git',
            repo: setup.clone,
            base: fetched.baseSha,
            head: fetched.headSha,
          },
        })
      ).json();

      expect(data.files.map((file: { path: string }) => file.path)).toEqual([
        'src/currency.ts',
        'src/money.ts',
      ]);
    });

    it('PR ref missing: reports that the PR was not found', async () => {
      const response = await fetchPr({ number: 99 });

      expect(response.json().error).toEqual({
        code: 'pr_not_found',
        message: 'Pull request #99 was not found on origin',
      });
    });

    it('Remote is not SSH: refuses an HTTPS remote', async () => {
      runGit(setup.clone, ['remote', 'add', 'https', 'https://github.com/acme/platform.git']);

      const response = await fetchPr({ remote: 'https' });

      expect(response.json().error).toEqual({
        code: 'remote_not_ssh',
        message:
          'Fetching a pull request needs an SSH remote; https uses https://github.com/acme/platform.git',
      });
    });

    it('reports an unreachable SSH remote without prompting', async () => {
      runGit(setup.clone, ['remote', 'add', 'nowhere', 'ssh://git@127.0.0.1:1/acme/platform.git']);

      const response = await fetchPr({ remote: 'nowhere' });

      expect(response.json().error.message).toBe(
        'Could not reach the remote over SSH. Check the network connection and try again.',
      );
    });

    it('refuses a base branch that could be read as an option', async () => {
      const response = await fetchPr({ baseBranch: '--upload-pack=touch /tmp/x' });

      expect(response.json().error.code).toBe('invalid_input');
    });
  });
});
