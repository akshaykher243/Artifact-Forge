import { access, mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { makeRepo, runGit, snapshotRepo } from '../../fixtures/repo-builder.ts';
import type { TestRepo } from '../../fixtures/repo-builder.ts';
import { buildTestApp, callOp } from '../../fixtures/test-app.ts';

const PNG_BYTES = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x00,
]);
const LONG_FILE = Array.from({ length: 40 }, (_, i) => `line ${i + 1}`).join('\n') + '\n';

describe('compare and fileDiff against a real repository', () => {
  let root: string;
  let repo: TestRepo;
  let app: FastifyInstance;
  let base: string;

  beforeAll(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'af-root-')));
    repo = await makeRepo(root);
    base = await repo.commit('base', {
      'src/keep.ts': LONG_FILE,
      'src/old name.ts': 'export const a = 1;\nexport const b = 2;\nexport const c = 3;\n',
      'docs/gone.md': '# Gone\n',
      'image.png': PNG_BYTES,
    });
    repo.git('switch', '--quiet', '-c', 'feature');
    await repo.commit('feature work', {
      'src/keep.ts': LONG_FILE.replace('line 3\n', 'line three\n').replace(
        'line 30\n',
        'line thirty\n',
      ),
      'src/old name.ts': null,
      'src/new name.ts': 'export const a = 1;\nexport const b = 2;\nexport const c = 3;\n',
      'docs/gone.md': null,
      'src/added.ts': 'export const added = true;\n',
      'image.png': Buffer.concat([PNG_BYTES, Buffer.from([1, 2, 3])]),
    });
    repo.git('switch', '--quiet', 'main');
    await repo.commit('main moved on', { 'main-only.txt': 'only on main\n' });
    app = await buildTestApp({ root });
  });

  afterAll(async () => {
    await app.close();
    await rm(root, { recursive: true, force: true });
  });

  const compare = async (baseRef: string, headRef: string) =>
    callOp(app, 'compare', {
      payload: { source: 'git', repo: repo.path, base: baseRef, head: headRef },
    });

  it('Matches Git: paths, statuses and counts equal git diff --numstat and --name-status', async () => {
    const response = await compare('main', 'feature');
    const { data } = response.json();
    const mergeBase = runGit(repo.path, ['merge-base', 'main', 'feature']);
    const numstat = runGit(repo.path, ['diff', '--numstat', '-M', mergeBase, 'feature']);

    expect(response.statusCode).toBe(200);
    expect(data.files).toEqual([
      {
        path: 'docs/gone.md',
        oldPath: null,
        status: 'deleted',
        additions: 0,
        deletions: 1,
        binary: false,
      },
      {
        path: 'image.png',
        oldPath: null,
        status: 'modified',
        additions: 0,
        deletions: 0,
        binary: true,
      },
      {
        path: 'src/added.ts',
        oldPath: null,
        status: 'added',
        additions: 1,
        deletions: 0,
        binary: false,
      },
      {
        path: 'src/keep.ts',
        oldPath: null,
        status: 'modified',
        additions: 2,
        deletions: 2,
        binary: false,
      },
      {
        path: 'src/new name.ts',
        oldPath: 'src/old name.ts',
        status: 'renamed',
        additions: 0,
        deletions: 0,
        binary: false,
      },
    ]);
    expect(numstat.split('\n')).toHaveLength(data.files.length);
    expect(data).toMatchObject({
      repo: repo.path.split('/').pop(),
      repoPath: repo.path,
      base: { name: 'main', sha: runGit(repo.path, ['rev-parse', 'main']) },
      head: { name: 'feature', sha: runGit(repo.path, ['rev-parse', 'feature']) },
    });
  });

  it('Base moved on: changes only on base are not shown', async () => {
    const { data } = (await compare('main', 'feature')).json();

    expect(data.files.map((file: { path: string }) => file.path)).not.toContain('main-only.txt');
  });

  it('returns a file diff with fold rows between hunks', async () => {
    const { data: comparison } = (await compare('main', 'feature')).json();
    const index = comparison.files.findIndex(
      (file: { path: string }) => file.path === 'src/keep.ts',
    );

    const { data } = (
      await callOp(app, 'fileDiff', { payload: { comparisonId: comparison.id, fileIndex: index } })
    ).json();

    expect(data.kind).toBe('rows');
    expect(data.rows).toContainEqual(['-', 3, null, 'line 3']);
    expect(data.rows).toContainEqual(['+', null, 30, 'line thirty']);
    expect(data.rows.filter((row: unknown[]) => row[0] === '~')).toEqual([
      ['~', null, null, '20 unchanged lines'],
    ]);
  });

  it('Binary or oversized file: returns a notice for a binary file', async () => {
    const { data: comparison } = (await compare('main', 'feature')).json();

    const { data } = (
      await callOp(app, 'fileDiff', { payload: { comparisonId: comparison.id, fileIndex: 1 } })
    ).json();

    expect(data).toEqual({ kind: 'notice', notice: 'Binary file not shown.' });
  });

  it('shows a pure rename as having no content changes', async () => {
    const { data: comparison } = (await compare('main', 'feature')).json();

    const { data } = (
      await callOp(app, 'fileDiff', { payload: { comparisonId: comparison.id, fileIndex: 4 } })
    ).json();

    expect(data).toEqual({
      kind: 'notice',
      notice: 'No content changes (renamed or mode change only).',
    });
  });

  it('accepts SHAs, tags and remote-style refs', async () => {
    repo.git('tag', 'base-tag', base);

    const response = await compare(
      'base-tag',
      runGit(repo.path, ['rev-parse', '--short', 'feature']),
    );

    expect(response.statusCode).toBe(200);
    expect(response.json().data.files).toHaveLength(5);
  });

  it('Unknown ref: reports it', async () => {
    const response = await compare('main', 'no-such-branch');

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toEqual({
      code: 'unknown_ref',
      message: 'Unknown ref: no-such-branch',
    });
  });

  it.each(['--output=/tmp/x', '-c core.pager=sh', 'main..feature'])(
    'Injected flag: rejects %s as a ref',
    async (ref) => {
      const response = await compare(ref, 'feature');

      expect(response.json().error.code).toBe('invalid_input');
    },
  );

  it('Identical commits: an empty file list', async () => {
    const { data } = (await compare('main', 'main')).json();

    expect(data.files).toEqual([]);
  });

  it('refuses a file index outside the comparison', async () => {
    const { data: comparison } = (await compare('main', 'feature')).json();

    const response = await callOp(app, 'fileDiff', {
      payload: { comparisonId: comparison.id, fileIndex: 99 },
    });

    expect(response.statusCode).toBe(404);
  });

  it('Path traversal: a path can never be requested, only an index', async () => {
    const { data: comparison } = (await compare('main', 'feature')).json();

    const response = await callOp(app, 'fileDiff', {
      payload: { comparisonId: comparison.id, fileIndex: 0, path: '../../etc/passwd' },
    });

    expect(response.statusCode).toBe(400);
  });

  it('reports an unknown comparison as expired', async () => {
    const response = await callOp(app, 'fileDiff', {
      payload: { comparisonId: 'git:0000', fileIndex: 0 },
    });

    expect(response.json().error.code).toBe('comparison_expired');
  });

  it('Repository unchanged: comparing writes nothing', async () => {
    const before = await snapshotRepo(repo.path);

    const { data: comparison } = (await compare('main', 'feature')).json();
    for (let index = 0; index < comparison.files.length; index++) {
      await callOp(app, 'fileDiff', { payload: { comparisonId: comparison.id, fileIndex: index } });
    }

    expect(await snapshotRepo(repo.path)).toEqual(before);
  });
});

describe('No common history', () => {
  it('No common history: reports refs that share no merge base', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'af-root-')));
    const repo = await makeRepo(root);
    await repo.commit('first', { 'a.txt': 'a\n' });
    repo.git('switch', '--quiet', '--orphan', 'unrelated');
    await repo.commit('other root', { 'b.txt': 'b\n' });
    const app = await buildTestApp({ root });

    const response = await callOp(app, 'compare', {
      payload: { source: 'git', repo: repo.path, base: 'main', head: 'unrelated' },
    });

    expect(response.json().error).toEqual({
      code: 'no_common_history',
      message: 'These refs have no common history.',
    });
    await app.close();
    await rm(root, { recursive: true, force: true });
  });
});

describe('Ambiguous abbreviated SHA', () => {
  it('Ambiguous abbreviated SHA: asks for a longer SHA', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'af-root-')));
    const repo = await makeRepo(root);
    await repo.commit('first', { 'a.txt': 'a\n' });
    // With the test identity and clock, these two empty-tree commits both start with 4cf6.
    const emptyTree = repo.git('hash-object', '-t', 'tree', '-w', '/dev/null');
    repo.git('commit-tree', emptyTree, '-m', 'm224');
    repo.git('commit-tree', emptyTree, '-m', 'm277');
    const app = await buildTestApp({ root });

    const response = await callOp(app, 'compare', {
      payload: { source: 'git', repo: repo.path, base: '4cf6', head: 'main' },
    });

    expect(response.json().error).toEqual({
      code: 'ambiguous_ref',
      message: '4cf6 matches more than one object. Enter a longer SHA.',
    });
    await app.close();
    await rm(root, { recursive: true, force: true });
  });
});

describe('Repository-defined diff driver', () => {
  it('Repository-defined diff driver: never runs an external diff or textconv driver the repository configures', async () => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'af-root-')));
    const marker = join(root, 'driver-ran');
    const repo = await makeRepo(root);
    repo.git('config', 'diff.evil.command', `touch ${marker}`);
    repo.git('config', 'diff.evil.textconv', `sh -c 'touch ${marker}; cat "$0"'`);
    await repo.commit('base', { '.gitattributes': '* diff=evil\n', 'a.txt': 'one\n' });
    repo.git('switch', '--quiet', '-c', 'feature');
    await repo.commit('change', { 'a.txt': 'two\n' });
    const app = await buildTestApp({ root });

    const { data } = (
      await callOp(app, 'compare', {
        payload: { source: 'git', repo: repo.path, base: 'main', head: 'feature' },
      })
    ).json();
    const diff = (
      await callOp(app, 'fileDiff', { payload: { comparisonId: data.id, fileIndex: 0 } })
    ).json();

    expect(diff.data.rows).toContainEqual(['+', null, 1, 'two']);
    await expect(access(marker)).rejects.toThrow();
    await app.close();
    await rm(root, { recursive: true, force: true });
  });
});
