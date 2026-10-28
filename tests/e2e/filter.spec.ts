import { expect, test } from './test.ts';

test.use({ fixture: 'small' });

test.describe('File filter', () => {
  test('Filter by path', async ({ workspace, page }) => {
    await workspace.open();

    await page.getByLabel('Filter files').fill('LIB/');

    await expect(
      workspace.tree.getByRole('button').and(page.locator(':not([aria-expanded])')),
    ).toHaveCount(1);
    await expect(workspace.fileRow('money.ts')).toBeVisible();
    await expect(workspace.sections).toHaveCount(1);
    await expect(page.getByText('Files, 1 of 11')).toBeVisible();

    await page.getByLabel('Filter files').fill('');

    await expect(workspace.sections).toHaveCount(11);
    await expect(page.getByText('Files, 11', { exact: true })).toBeVisible();
  });

  test('No file matches', async ({ workspace, page }) => {
    await workspace.open();

    await page.getByLabel('Filter files').fill('nothing-like-this');

    await expect(page.getByText('No files match nothing-like-this.')).toBeVisible();
    await expect(workspace.sections).toHaveCount(0);
    await expect(page.getByText('Files, 0 of 11')).toBeVisible();
  });
});
