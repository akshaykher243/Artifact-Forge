import { mkdtemp, readdir, readFile, realpath, rm, stat, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { createJsonStore } from '../../../../src/server/store/json-store.ts';
import type { CorruptFile } from '../../../../src/server/store/json-store.ts';
import { createReviewMarks } from '../../../../src/server/store/review-marks.ts';

const numbers = z.array(z.number());

describe('JSON store', () => {
  let dir: string;
  let corrupt: CorruptFile[];

  beforeEach(async () => {
    dir = await realpath(await mkdtemp(join(tmpdir(), 'af-store-')));
    corrupt = [];
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  const store = () => createJsonStore({ dir, onCorrupt: (file) => corrupt.push(file) });

  it('returns the fallback for a missing document', async () => {
    expect(await store().read('missing.json', numbers, [7])).toEqual([7]);
  });

  it('writes atomically with private permissions and leaves no temporary files', async () => {
    await store().write('nested/value.json', [1, 2]);

    expect(JSON.parse(await readFile(join(dir, 'nested/value.json'), 'utf8'))).toEqual([1, 2]);
    expect((await stat(join(dir, 'nested/value.json'))).mode & 0o777).toBe(0o600);
    expect((await stat(join(dir, 'nested'))).mode & 0o777).toBe(0o700);
    expect(await readdir(join(dir, 'nested'))).toEqual(['value.json']);
  });

  it('keeps every one of many concurrent updates', async () => {
    const shared = store();

    await Promise.all(
      Array.from({ length: 50 }, (_, i) =>
        shared.update('list.json', numbers, [], (list) => [...list, i]),
      ),
    );

    expect((await shared.read('list.json', numbers, [])).sort((a, b) => a - b)).toEqual(
      Array.from({ length: 50 }, (_, i) => i),
    );
  });

  it('moves a corrupt document aside, reports it and starts from the fallback', async () => {
    await writeFile(join(dir, 'broken.json'), '{ not json');

    const value = await store().read('broken.json', numbers, []);

    expect(value).toEqual([]);
    expect(corrupt).toEqual([
      { name: 'broken.json', quarantinedAs: expect.stringMatching(/broken\.json\.corrupt-\d+$/) },
    ]);
    expect((await readdir(dir)).some((name) => name.startsWith('broken.json.corrupt-'))).toBe(true);
  });

  it('treats a document of the wrong shape as corrupt', async () => {
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'shape.json'), '{"not":"a list"}');

    expect(await store().read('shape.json', numbers, [])).toEqual([]);
    expect(corrupt).toHaveLength(1);
  });

  it('refuses a name that escapes the data folder', async () => {
    await expect(store().write('../escape.json', [])).rejects.toThrow('escapes the data folder');
  });
});

describe('review marks', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await realpath(await mkdtemp(join(tmpdir(), 'af-marks-')));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('adds and removes reviewed paths per comparison', async () => {
    const marks = createReviewMarks(createJsonStore({ dir, onCorrupt: () => undefined }));

    await marks.set('git:abc123', 'b.ts', true);
    await marks.set('git:abc123', 'a.ts', true);
    await marks.set('fixture:small', 'z.ts', true);
    await marks.set('git:abc123', 'b.ts', false);

    expect(await marks.list('git:abc123')).toEqual(['a.ts']);
    expect(await marks.list('fixture:small')).toEqual(['z.ts']);
  });

  it('refuses an unexpected comparison id', async () => {
    const marks = createReviewMarks(createJsonStore({ dir, onCorrupt: () => undefined }));

    await expect(marks.list('git:../../etc')).rejects.toThrow('Unexpected comparison id');
  });
});
