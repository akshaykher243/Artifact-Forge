import { mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { loadConfig } from '../../../src/server/config.ts';
import { StartupError } from '../../../src/server/errors.ts';

describe('start-up configuration', () => {
  let dir: string;

  beforeEach(async () => {
    dir = await realpath(await mkdtemp(join(tmpdir(), 'af-config-')));
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('uses the given roots and port', async () => {
    const config = await loadConfig(['--root', dir, '--port', '5000']);

    expect(config).toMatchObject({ roots: [dir], port: 5000, dev: false, fixture: null });
  });

  it('accepts several roots and resolves symlinks to their real path', async () => {
    const link = join(dir, 'link');
    await symlink(dir, link);

    const config = await loadConfig(['--root', dir, '--root', link]);

    expect(config.roots).toEqual([dir, dir]);
  });

  it('fails fast when a root does not exist', async () => {
    const missing = join(dir, 'missing');

    await expect(loadConfig(['--root', missing])).rejects.toThrow(
      new StartupError(`Root folder not found: ${missing}`),
    );
  });

  it('fails fast when a root is a file', async () => {
    const file = join(dir, 'file.txt');
    await writeFile(file, 'x');

    await expect(loadConfig(['--root', file])).rejects.toThrow('Root is not a folder');
  });

  it('refuses a relative root', async () => {
    await expect(loadConfig(['--root', 'relative/dir'])).rejects.toThrow('absolute path');
  });

  it.each(['80', 'abc', '70000', '4317.5'])('refuses port %s', async (port) => {
    await expect(loadConfig(['--root', dir, '--port', port])).rejects.toThrow('--port must be');
  });

  it('refuses unknown flags', async () => {
    await expect(loadConfig(['--root', dir, '--shell', 'sh'])).rejects.toBeInstanceOf(StartupError);
  });

  it('accepts a known fixture name', async () => {
    const config = await loadConfig(['--root', dir, '--fixture', 'large']);

    expect(config.fixture).toBe('large');
  });

  it('refuses an unknown fixture name', async () => {
    await expect(loadConfig(['--root', dir, '--fixture', 'huge'])).rejects.toThrow(
      '--fixture must be one of small, large',
    );
  });
});
