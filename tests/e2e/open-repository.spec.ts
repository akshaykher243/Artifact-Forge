import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';

import { makeRepo } from '../fixtures/repo-builder.ts';
import { expect, test } from './test.ts';

test.describe('Open a repository inside a configured root', () => {
  test('Valid repository: opens it from the UI and lists its refs', async ({ appPage, app }) => {
    const repo = await makeRepo(app.root);
    await repo.commit('first', { 'a.txt': 'one\n' });
    repo.git('branch', 'feature');
    repo.git('tag', 'v1');
    await appPage.openWithStartUrl();

    await appPage.openRepository(repo.path);

    await expect(appPage.heading).toHaveText(repo.path.split('/').pop() ?? '');
    await expect(appPage.status).toHaveText('2 branches · 0 remote branches · 1 tags');
  });

  test('shows the recent repository after a reload', async ({ appPage, app, page }) => {
    const repo = await makeRepo(app.root);
    await repo.commit('first', { 'a.txt': 'one\n' });
    await appPage.openWithStartUrl();
    await appPage.openRepository(repo.path);
    await expect(appPage.status).toContainText('branches');

    await page.reload();
    await appPage.recents.getByRole('button', { name: new RegExp(repo.path) }).click();

    await expect(appPage.heading).toHaveText(repo.path.split('/').pop() ?? '');
  });

  test('Not a repository: shows the error and stays on the picker', async ({ appPage, app }) => {
    const plain = join(app.root, 'plain-folder');
    await mkdir(plain);
    await appPage.openWithStartUrl();

    await appPage.openRepository(plain);

    await expect(appPage.error).toHaveText('Not a Git repository');
    await expect(appPage.heading).toHaveText('Open a repository');
  });

  test('Outside the roots: names the configured root', async ({ appPage, app }) => {
    await appPage.openWithStartUrl();

    await appPage.openRepository('/usr');

    await expect(appPage.error).toHaveText(`Repositories must be inside: ${app.root}`);
  });
});
