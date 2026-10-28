import { makeRepo, snapshotRepo } from '../fixtures/repo-builder.ts';
import type { TestRepo } from '../fixtures/repo-builder.ts';
import { expect, test } from './test.ts';

const makeFeatureRepo = async (root: string): Promise<TestRepo> => {
  const repo = await makeRepo(root);
  await repo.commit('base', {
    'src/money.ts': 'export const toCents = (amount: number) => Math.round(amount * 100);\n',
    'README.md': '# Shop\n',
  });
  repo.git('switch', '--quiet', '-c', 'feature/currency');
  await repo.commit('currency', {
    'src/money.ts': 'export const toMinorUnits = (amount: number) => Math.round(amount * 100);\n',
    'src/currency.ts': "export type Currency = 'USD' | 'EUR';\n",
  });
  return repo;
};

test.describe('Choose base and head', () => {
  test('compares two branches and shows the real diff, leaving the repository unchanged', async ({
    appPage,
    workspace,
    app,
    page,
  }) => {
    const repo = await makeFeatureRepo(app.root);
    const before = await snapshotRepo(repo.path);
    await appPage.openWithStartUrl();
    await appPage.openRepository(repo.path);

    await expect(page.getByLabel('Base')).toHaveValue('main');
    await expect(page.getByLabel('Head')).toHaveValue('feature/currency');
    await page.getByRole('button', { name: 'Compare' }).click();

    await expect(workspace.heading).toHaveText('2 changed files');
    await expect(workspace.crumb).toContainText('feature/currency vs main');
    const section = workspace.section('src/money.ts');
    await expect(section.getByText('toMinorUnits', { exact: false })).toBeVisible();
    await expect(workspace.fileRow('currency.ts')).toContainText('+1');
    expect(await snapshotRepo(repo.path)).toEqual(before);
  });

  test('Unknown ref: shows the error and keeps the picker', async ({ appPage, app, page }) => {
    const repo = await makeFeatureRepo(app.root);
    await appPage.openWithStartUrl();
    await appPage.openRepository(repo.path);

    await page.getByLabel('Head').fill('no-such-branch');
    await page.getByRole('button', { name: 'Compare' }).click();

    await expect(appPage.error).toHaveText('Unknown ref: no-such-branch');
    await expect(page.getByLabel('Base')).toBeVisible();
  });

  test('Change returns to base and head selection for the same repository', async ({
    appPage,
    workspace,
    app,
    page,
  }) => {
    const repo = await makeFeatureRepo(app.root);
    await appPage.openWithStartUrl();
    await appPage.openRepository(repo.path);
    await page.getByRole('button', { name: 'Compare' }).click();
    await expect(workspace.heading).toHaveText('2 changed files');

    await page.getByRole('button', { name: 'Change', exact: true }).click();

    await expect(page.getByLabel('Head')).toHaveValue('feature/currency');
    await expect(appPage.heading).toHaveText(repo.path.split('/').pop() ?? '');
  });
});
