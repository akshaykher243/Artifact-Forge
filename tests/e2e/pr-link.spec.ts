import { join } from 'node:path';

import { authStatusRule, prViewRule, writeFakeGhRules } from '../fixtures/fake-gh.ts';
import { GITHUB_SSH_URL, makePrSetup, PR_NUMBER } from '../fixtures/pr-remote.ts';
import type { PrSetup } from '../fixtures/pr-remote.ts';
import { runGit } from '../fixtures/repo-builder.ts';
import type { RunningApp } from '../fixtures/app-server.ts';
import { expect, test } from './test.ts';

const LINK = `https://github.com/acme/platform/pull/${PR_NUMBER}/files`;

const prepare = async (app: RunningApp): Promise<PrSetup> => {
  const setup = await makePrSetup(app.root);
  await writeFakeGhRules(app.ghHome, [
    authStatusRule('octo-reviewer'),
    prViewRule({ number: PR_NUMBER, baseRefOid: setup.baseSha, headRefOid: setup.headSha }),
  ]);
  return setup;
};

test.describe('Open a pull request from its link', () => {
  test('Link to a cloned repository: opens the clone and starts the review', async ({
    app,
    appPage,
    workspace,
    page,
  }) => {
    const setup = await prepare(app);
    await appPage.openWithStartUrl();

    await appPage.openRepository(LINK);

    await expect(page.getByRole('region', { name: 'Pull request' })).toContainText(
      'acme/platform #42',
    );
    await expect(workspace.heading).toHaveText('2 changed files');
    await setup.remove();
  });

  test('Several clones: lets the reviewer pick one, then starts the review', async ({
    app,
    appPage,
    workspace,
    page,
  }) => {
    const setup = await prepare(app);
    const second = join(app.root, 'platform-copy');
    runGit(app.root, ['clone', '--quiet', setup.clone, second]);
    runGit(second, ['remote', 'set-url', 'origin', GITHUB_SSH_URL]);
    const rewrite = runGit(setup.clone, ['config', '--get-regexp', '^url\\..*\\.insteadof$']).split(
      ' ',
    );
    runGit(second, ['config', rewrite[0] ?? '', rewrite[1] ?? '']);
    await appPage.openWithStartUrl();

    await appPage.openRepository(LINK);
    const choices = page.getByRole('region', { name: 'Choose a clone' });
    await expect(choices.getByRole('button')).toHaveCount(2);
    await choices.getByRole('button', { name: /platform-copy/ }).click();

    await expect(workspace.heading).toHaveText('2 changed files');
    await expect(appPage.page.getByRole('region', { name: 'Pull request' })).toContainText('#42');
    await setup.remove();
  });

  test('No clone: explains how to get one', async ({ app, appPage }) => {
    await appPage.openWithStartUrl();

    await appPage.openRepository('https://github.com/acme/unknown/pull/1');

    await expect(appPage.error).toContainText(
      `No local clone of acme/unknown was found inside ${app.root}.`,
    );
    await expect(appPage.error).toContainText('git clone git@github.com:acme/unknown.git');
  });

  test('Not a pull request link: asks for a pull request link or a path', async ({
    appPage,
    page,
  }) => {
    let searched = false;
    await page.route('**/api/op/findClones', async (route) => {
      searched = true;
      await route.continue();
    });
    await appPage.openWithStartUrl();

    await appPage.openRepository('https://github.com/acme/platform/issues/3');

    await expect(appPage.error).toHaveText(
      'Enter a folder path or a GitHub pull request link, such as https://github.com/owner/repo/pull/42.',
    );
    expect(searched).toBe(false);
  });
});
