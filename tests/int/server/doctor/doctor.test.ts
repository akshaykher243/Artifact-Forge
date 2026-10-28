import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import type { Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findBinary } from '../../../../src/server/config.ts';
import type { StartupSettings } from '../../../../src/server/config.ts';
import { runDoctor } from '../../../../src/server/doctor/doctor.ts';
import { authStatusRule, createFakeGh, FAKE_GH_BIN_DIR } from '../../../fixtures/fake-gh.ts';
import type { FakeGh } from '../../../fixtures/fake-gh.ts';

const FREE_PORT = 4391;

describe('runDoctor', () => {
  let dir: string;
  let gh: FakeGh;
  let settings: StartupSettings;
  let build: string;

  beforeEach(async () => {
    dir = await realpath(await mkdtemp(join(tmpdir(), 'af-doctor-')));
    gh = await createFakeGh();
    // A PATH holding only git, node and the fake gh: no ssh, so nothing reaches the network.
    const bin = join(dir, 'bin');
    await mkdir(bin);
    await symlink((await findBinary('git', process.env.PATH ?? '')) ?? '', join(bin, 'git'));
    // The fake gh is a Node script.
    await symlink(process.execPath, join(bin, 'node'));
    build = join(dir, 'dist');
    await mkdir(build);
    await writeFile(join(build, 'index.html'), '<!doctype html>');
    settings = {
      rootPaths: [dir],
      port: FREE_PORT,
      dev: false,
      fixture: null,
      dataDir: join(dir, 'data'),
      homeDir: dir,
      searchPath: `${FAKE_GH_BIN_DIR}:${bin}`,
      childEnv: { PATH: `${FAKE_GH_BIN_DIR}:${bin}`, HOME: gh.home },
    };
  });

  afterEach(async () => {
    await gh.remove();
    await rm(dir, { recursive: true, force: true });
  });

  const statuses = async (overrides: Partial<StartupSettings> = {}, buildDir = build) =>
    Object.fromEntries(
      (
        await runDoctor({
          settings: { ...settings, ...overrides },
          nodeVersion: '22.13.1',
          clientBuildDir: buildDir,
        })
      ).map((check) => [check.name, `${check.status}: ${check.detail}`]),
    );

  it('reports a ready machine, with pull request checks as warnings when ssh is missing', async () => {
    await gh.setRules([authStatusRule('octocat')]);

    expect(await statuses()).toEqual({
      'Node.js': 'ok: 22.13.1',
      Git: expect.stringMatching(/^ok: \d+\.\d+/),
      'Built UI': `ok: ${build}`,
      'Repository folders': `ok: ${dir}`,
      'Data folder': `ok: ${join(dir, 'data')}`,
      Port: `ok: 127.0.0.1:${FREE_PORT} is free`,
      'GitHub over SSH': 'warn: ssh not found',
      'GitHub CLI': 'ok: signed in as octocat',
    });
  });

  it('fails what stops the app from starting, and says how to fix it', async () => {
    await gh.setRules([authStatusRule(null)]);
    const blocker: Server = createServer();
    await new Promise<void>((resolve) => blocker.listen(FREE_PORT, '127.0.0.1', resolve));
    try {
      const result = await statuses({ rootPaths: [join(dir, 'missing')] }, join(dir, 'nowhere'));

      expect(result).toMatchObject({
        'Built UI': 'fail: not built yet',
        'Repository folders': expect.stringMatching(/^fail: Root folder not found/),
        Port: expect.stringMatching(/^fail: 4391 is in use/),
        'GitHub CLI': 'warn: not signed in to github.com',
      });
    } finally {
      await new Promise((resolve) => blocker.close(resolve));
    }
  });

  it('reports a missing gh as a warning only', async () => {
    expect((await statuses({ searchPath: join(dir, 'bin') }))['GitHub CLI']).toBe(
      'warn: gh not found on PATH',
    );
  });
});
