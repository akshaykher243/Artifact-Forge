import { mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createGitClient } from '../../../../src/server/git/git-client.ts';
import { readSnapshot } from '../../../../src/server/map/snapshot.ts';
import { MAP_SOURCE_LIMIT } from '../../../../src/shared/map.ts';
import { createProcessRunner } from '../../../../src/server/security/run-process.ts';
import { makeRepo } from '../../../fixtures/repo-builder.ts';
import type { TestRepo } from '../../../fixtures/repo-builder.ts';

const git = createGitClient(
  createProcessRunner({
    env: { PATH: process.env.PATH ?? '', HOME: tmpdir() },
    log: () => undefined,
  }),
  'git',
);

describe('readSnapshot', () => {
  let root: string;
  let repo: TestRepo;

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'af-snap-')));
    repo = await makeRepo(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('Working tree differs from the commit: reads the commit, not the working tree', async () => {
    const head = await repo.commit('base', { 'src/a.ts': 'export const a = 1;\n' });
    await writeFile(join(repo.path, 'src/a.ts'), 'export const a = 2; // uncommitted\n');

    const snapshot = await readSnapshot(git, repo.path, head);

    expect(snapshot.state === 'ready' && snapshot.files.get('src/a.ts')).toBe(
      'export const a = 1;\n',
    );
  });

  it('skips generated folders and non-source files, and reads tsconfig.json', async () => {
    const head = await repo.commit('base', {
      'src/a.ts': 'export const a = 1;\n',
      'dist/a.js': 'compiled',
      'node_modules/x/index.js': 'dependency',
      'README.md': '# readme',
      'tsconfig.json': '{ "compilerOptions": { "baseUrl": "." } }',
    });

    const snapshot = await readSnapshot(git, repo.path, head);

    expect(snapshot.state).toBe('ready');
    if (snapshot.state === 'ready') {
      expect([...snapshot.files.keys()]).toEqual(['src/a.ts']);
      expect(snapshot.tsconfig).toContain('baseUrl');
    }
  });

  it('Too large: reports the count without reading contents', async () => {
    const files = Object.fromEntries(
      Array.from({ length: MAP_SOURCE_LIMIT + 1 }, (_, i) => [`src/f${i}.ts`, '']),
    );
    const head = await repo.commit('many', files);

    const snapshot = await readSnapshot(git, repo.path, head);

    expect(snapshot).toEqual({ state: 'tooLarge', sourceFileCount: MAP_SOURCE_LIMIT + 1 });
  });

  it('reads more files than one batch holds', async () => {
    const files = Object.fromEntries(
      Array.from({ length: 450 }, (_, i) => [`src/f${i}.ts`, `export const v${i} = ${i};\n`]),
    );
    const head = await repo.commit('batch', files);

    const snapshot = await readSnapshot(git, repo.path, head);

    expect(snapshot.state === 'ready' && snapshot.files.size).toBe(450);
    expect(snapshot.state === 'ready' && snapshot.files.get('src/f449.ts')).toBe(
      'export const v449 = 449;\n',
    );
  });
});
