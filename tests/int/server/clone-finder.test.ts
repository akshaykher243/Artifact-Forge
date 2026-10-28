import { mkdir, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeRepo, runGit } from '../../fixtures/repo-builder.ts';
import { buildTestApp, callOp } from '../../fixtures/test-app.ts';

/** A repository in `parent` whose remotes are `remotes` (name to URL). */
const cloneAt = async (parent: string, remotes: Record<string, string>): Promise<string> => {
  await mkdir(parent, { recursive: true });
  const repo = await makeRepo(parent);
  for (const [name, url] of Object.entries(remotes)) {
    runGit(repo.path, ['remote', 'add', name, url]);
  }
  return repo.path;
};

describe('findClones', () => {
  let root: string;
  let outside: string;
  let app: FastifyInstance;

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'af-root-')));
    outside = await realpath(await mkdtemp(join(tmpdir(), 'af-outside-')));
    app = await buildTestApp({ root });
  });

  afterEach(async () => {
    await app.close();
    await rm(root, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  });

  const find = async (owner: string, name: string) =>
    (await callOp(app, 'findClones', { payload: { owner, name } })).json().data.clones;

  it('Link to a cloned repository: finds the clone and its GitHub remote, ignoring case', async () => {
    const path = await cloneAt(join(root, 'work'), { origin: 'git@github.com:Acme/Platform.git' });

    expect(await find('acme', 'platform')).toEqual([
      { path, name: path.split('/').pop(), remote: 'origin' },
    ]);
  });

  it('prefers an SSH remote over an HTTPS one in the same clone', async () => {
    await cloneAt(root, {
      a: 'https://github.com/acme/platform.git',
      origin: 'git@github.com:acme/platform.git',
    });

    expect((await find('acme', 'platform'))[0].remote).toBe('origin');
  });

  it('Several clones: finds every matching clone, including nested ones', async () => {
    await cloneAt(join(root, 'one'), { origin: 'git@github.com:acme/platform.git' });
    await cloneAt(join(root, 'deep', 'er', 'down'), {
      upstream: 'git@github.com:acme/platform.git',
    });
    await cloneAt(join(root, 'other'), { origin: 'git@github.com:acme/website.git' });

    expect(
      (await find('acme', 'platform')).map((clone: { remote: string }) => clone.remote).sort(),
    ).toEqual(['origin', 'upstream']);
  });

  it('No clone: returns none when no remote points at the repository', async () => {
    await cloneAt(root, { origin: 'git@github.com:acme/website.git' });

    expect(await find('acme', 'platform')).toEqual([]);
  });

  it('ignores clones outside the roots and in hidden or dependency folders', async () => {
    await cloneAt(outside, { origin: 'git@github.com:acme/platform.git' });
    await cloneAt(join(root, '.cache'), { origin: 'git@github.com:acme/platform.git' });
    await cloneAt(join(root, 'node_modules'), { origin: 'git@github.com:acme/platform.git' });

    expect(await find('acme', 'platform')).toEqual([]);
  });

  it('refuses names that are not GitHub names', async () => {
    const response = await callOp(app, 'findClones', {
      payload: { owner: '..', name: 'platform' },
    });

    expect(response.statusCode).toBe(400);
  });
});
