import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { GitClient } from '../../../src/server/git/git-client.ts';
import { openRepository } from '../../../src/server/git/repository.ts';
import { makeRepo, snapshotRepo } from '../../fixtures/repo-builder.ts';
import type { TestRepo } from '../../fixtures/repo-builder.ts';
import { buildTestApp, callOp } from '../../fixtures/test-app.ts';

describe('Open a repository inside a configured root', () => {
  let root: string;
  let outside: string;
  let repo: TestRepo;
  let app: FastifyInstance;

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'af-root-')));
    outside = await realpath(await mkdtemp(join(tmpdir(), 'af-outside-')));
    repo = await makeRepo(root);
    await repo.commit('first', { 'a.txt': 'one\n' });
    app = await buildTestApp({ root });
  });

  afterEach(async () => {
    await app.close();
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  it('Valid repository: opens it and remembers it as recent', async () => {
    const opened = await callOp(app, 'openRepo', { payload: { path: repo.path } });
    const recents = await callOp(app, 'recentRepos');

    expect(opened.json()).toEqual({
      success: true,
      data: { path: repo.path, name: repo.path.split('/').pop() },
    });
    expect(recents.json().data.repos).toEqual([
      expect.objectContaining({ path: repo.path, openedAt: expect.any(String) }),
    ]);
  });

  it('Outside the roots: refuses and names the configured roots', async () => {
    const other = await makeRepo(outside);

    const response = await callOp(app, 'openRepo', { payload: { path: other.path } });

    expect(response.statusCode).toBe(403);
    expect(response.json().error).toEqual({
      code: 'outside_roots',
      message: `Repositories must be inside: ${root}`,
    });
  });

  it('Outside the roots: follows a symlink inside the root before deciding', async () => {
    const other = await makeRepo(outside);
    const link = join(root, 'looks-inside');
    await symlink(other.path, link);

    const response = await callOp(app, 'openRepo', { payload: { path: link } });

    expect(response.json().error.code).toBe('outside_roots');
  });

  it('Not a repository: refuses a plain folder', async () => {
    const plain = join(root, 'plain');
    await mkdir(plain);

    const response = await callOp(app, 'openRepo', { payload: { path: plain } });

    expect(response.json().error).toEqual({
      code: 'not_a_repository',
      message: 'Not a Git repository',
    });
  });

  it('Not a repository: refuses a folder inside a repository', async () => {
    await repo.commit('nested', { 'sub/b.txt': 'two\n' });

    const response = await callOp(app, 'openRepo', { payload: { path: join(repo.path, 'sub') } });

    expect(response.json().error.code).toBe('not_a_repository');
  });

  it('Not a repository: refuses a file', async () => {
    const file = join(root, 'file.txt');
    await writeFile(file, 'x');

    const response = await callOp(app, 'openRepo', { payload: { path: file } });

    expect(response.json().error.code).toBe('not_a_repository');
  });

  it('Missing path: reports that the path was not found', async () => {
    const missing = join(root, 'missing');

    const response = await callOp(app, 'openRepo', { payload: { path: missing } });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toEqual({
      code: 'path_not_found',
      message: `Path not found: ${missing}`,
    });
  });

  it('refuses a relative path', async () => {
    const response = await callOp(app, 'openRepo', { payload: { path: 'relative/repo' } });

    expect(response.json().error.code).toBe('invalid_input');
  });

  it('opening a repository leaves it unchanged', async () => {
    const before = await snapshotRepo(repo.path);

    await callOp(app, 'openRepo', { payload: { path: repo.path } });
    await callOp(app, 'listRefs', { payload: { repo: repo.path } });

    expect(await snapshotRepo(repo.path)).toEqual(before);
  });
});

describe('refused paths start no Git process', () => {
  let root: string;
  let outside: string;

  beforeAll(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'af-root-')));
    outside = await realpath(await mkdtemp(join(tmpdir(), 'af-outside-')));
  });

  afterAll(async () => {
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  it.each([
    ['outside the roots', () => outside],
    ['missing', () => join(root, 'missing')],
    ['relative', () => 'relative/path'],
  ])('%s', async (_label, path) => {
    const calls: string[][] = [];
    const recordingGit: GitClient = {
      exec: async (_repo, args) => {
        calls.push([...args]);
        return { exitCode: 0, stdout: '', stderr: '', stdoutBytes: Buffer.alloc(0) };
      },
      run: async (_repo, args) => {
        calls.push([...args]);
        return '';
      },
      feed: async (_repo, args) => {
        calls.push([...args]);
        return { exitCode: 0, stdout: '', stderr: '', stdoutBytes: Buffer.alloc(0) };
      },
    };

    await expect(
      openRepository(recordingGit, path(), { roots: [root], homeDir: root }),
    ).rejects.toThrow();
    expect(calls).toEqual([]);
  });
});

describe('listRefs', () => {
  let root: string;
  let repo: TestRepo;
  let app: FastifyInstance;
  let first: string;
  let second: string;

  beforeAll(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'af-root-')));
    repo = await makeRepo(root);
    first = await repo.commit('first', { 'a.txt': 'one\n' });
    repo.git('tag', '-a', 'v1.0.0', '-m', 'release');
    repo.git('switch', '--quiet', '-c', 'feature/currency');
    second = await repo.commit('second', { 'a.txt': 'two\n' });
    repo.git('remote', 'add', 'origin', 'git@github.com:acme/platform.git');
    repo.git('remote', 'add', 'mirror', 'https://github.com/acme/platform.git');
    repo.git('update-ref', 'refs/remotes/origin/main', first);
    repo.git('symbolic-ref', 'refs/remotes/origin/HEAD', 'refs/remotes/origin/main');
    app = await buildTestApp({ root });
  });

  afterAll(async () => {
    await app.close();
    await rm(root, { recursive: true, force: true });
  });

  it('lists branches, remote branches, peeled tags, remotes and the current branch', async () => {
    const { data } = (await callOp(app, 'listRefs', { payload: { repo: repo.path } })).json();

    expect(data).toEqual({
      head: 'feature/currency',
      branches: [
        { name: 'feature/currency', sha: second },
        { name: 'main', sha: first },
      ],
      remoteBranches: [{ name: 'origin/main', sha: first }],
      tags: [{ name: 'v1.0.0', sha: first }],
      remotes: [
        {
          name: 'mirror',
          url: 'https://github.com/acme/platform.git',
          github: { owner: 'acme', name: 'platform' },
          ssh: false,
        },
        {
          name: 'origin',
          url: 'git@github.com:acme/platform.git',
          github: { owner: 'acme', name: 'platform' },
          ssh: true,
        },
      ],
    });
  });

  it('reports a detached HEAD as no current branch', async () => {
    repo.git('switch', '--quiet', '--detach', first);

    const { data } = (await callOp(app, 'listRefs', { payload: { repo: repo.path } })).json();

    expect(data.head).toBeNull();
    repo.git('switch', '--quiet', 'feature/currency');
  });
});
