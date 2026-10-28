import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startApp } from '../fixtures/app-server.ts';
import { makeRepo } from '../fixtures/repo-builder.ts';
import type { TestRepo } from '../fixtures/repo-builder.ts';
import type { AppPage } from './pages/app-page.ts';
import { expect, test } from './test.ts';

const makeTwoBranchRepo = async (root: string): Promise<TestRepo> => {
  const repo = await makeRepo(root);
  await repo.commit('base', { 'a.ts': 'a\n', 'b.ts': 'b\n' });
  repo.git('switch', '--quiet', '-c', 'one');
  await repo.commit('one', { 'a.ts': 'a1\n', 'b.ts': 'b1\n' });
  repo.git('switch', '--quiet', '-c', 'two', 'main');
  await repo.commit('two', { 'a.ts': 'a2\n' });
  return repo;
};

const compare = async (appPage: AppPage, base: string, head: string): Promise<void> => {
  await appPage.page.getByLabel('Base').fill(base);
  await appPage.page.getByLabel('Head').fill(head);
  await appPage.page.getByRole('button', { name: 'Compare' }).click();
};

test.describe('Reviewed marks', () => {
  test('Marks follow the comparison', async ({ appPage, workspace, app, page }) => {
    const repo = await makeTwoBranchRepo(app.root);
    await appPage.openWithStartUrl();
    await appPage.openRepository(repo.path);
    await compare(appPage, 'main', 'one');
    await workspace.reviewedCheckbox('a.ts').check();
    await expect(workspace.progress).toHaveText('50%');

    await page.getByRole('button', { name: 'Change', exact: true }).click();
    await compare(appPage, 'main', 'two');
    await expect(workspace.heading).toHaveText('1 changed file');
    await expect(workspace.reviewedCheckbox('a.ts')).not.toBeChecked();

    await page.getByRole('button', { name: 'Change', exact: true }).click();
    await compare(appPage, 'main', 'one');

    await expect(workspace.reviewedCheckbox('a.ts')).toBeChecked();
    await expect(workspace.reviewedCheckbox('b.ts')).not.toBeChecked();
    await expect(workspace.progress).toHaveText('50%');
  });

  test('Marks survive a restart', async ({ browser }) => {
    // The test owns the folders so they outlive the first app.
    const root = await realpath(await mkdtemp(join(tmpdir(), 'af-e2e-root-')));
    const dataDir = await realpath(await mkdtemp(join(tmpdir(), 'af-e2e-data-')));
    const first = await startApp({ fixture: 'small', root, dataDir });
    const page = await browser.newPage();
    await page.goto(first.startUrl);
    await page.getByRole('checkbox', { name: 'Mark src/lib/money.ts reviewed' }).check();
    await expect(page.getByText('Remaining').locator('..')).toContainText('+34−20');
    await first.stop();

    const second = await startApp({ fixture: 'small', root, dataDir });
    await page.goto(second.startUrl);

    await expect(
      page.getByRole('checkbox', { name: 'Mark src/lib/money.ts reviewed' }),
    ).toBeChecked();
    await expect(page.getByText('Remaining').locator('..')).toContainText('+34−20');
    await page.close();
    await second.stop();
    await rm(root, { recursive: true, force: true });
    await rm(dataDir, { recursive: true, force: true });
  });
});
