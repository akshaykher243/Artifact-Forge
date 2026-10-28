import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { makeRepo, snapshotRepo } from '../../fixtures/repo-builder.ts';
import type { TestRepo } from '../../fixtures/repo-builder.ts';

describe('test repository helpers', () => {
  let repo: TestRepo;

  beforeEach(async () => {
    repo = await makeRepo();
  });

  afterEach(async () => {
    await repo.remove();
  });

  it('commits, edits and deletes files on main', async () => {
    await repo.commit('first', { 'a.txt': 'one\n', 'dir/b.txt': 'two\n' });
    await repo.commit('second', { 'a.txt': null });

    expect(repo.git('branch', '--show-current')).toBe('main');
    expect(repo.git('ls-files')).toBe('dir/b.txt');
    expect(repo.git('rev-list', '--count', 'HEAD')).toBe('2');
  });

  it('a no-op leaves the snapshot identical', async () => {
    await repo.commit('first', { 'a.txt': 'one\n' });
    const before = await snapshotRepo(repo.path);

    repo.git('log', '--oneline');

    expect(await snapshotRepo(repo.path)).toEqual(before);
  });

  it('notices a new branch in the snapshot', async () => {
    await repo.commit('first', { 'a.txt': 'one\n' });
    const before = await snapshotRepo(repo.path);

    repo.git('branch', 'feature');

    expect((await snapshotRepo(repo.path)).refs).not.toBe(before.refs);
  });
});
