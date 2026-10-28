import { makeRepo } from '../fixtures/repo-builder.ts';
import { expect, test } from './test.ts';

test.describe('Side-by-side diff rendering', () => {
  test('Binary or oversized file: shows a notice and can still be marked reviewed', async ({
    appPage,
    workspace,
    app,
    page,
  }) => {
    const repo = await makeRepo(app.root);
    await repo.commit('base', { 'logo.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 1]) });
    repo.git('switch', '--quiet', '-c', 'big');
    const big = Array.from({ length: 3_500 }, (_, i) => `row ${i}`).join('\n');
    await repo.commit('big', {
      'logo.png': Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 2]),
      'data.txt': `${big}\n`,
    });
    await appPage.openWithStartUrl();
    await appPage.openRepository(repo.path);
    await page.getByLabel('Head').fill('big');
    await page.getByRole('button', { name: 'Compare' }).click();

    await expect(workspace.section('logo.png').getByText('Binary file not shown.')).toBeVisible();
    await expect(
      workspace.section('data.txt').getByText('Large diff not shown: more than 3,000 lines.'),
    ).toBeVisible();
    await workspace.reviewedCheckbox('logo.png').check();
    await expect(workspace.fileRow('logo.png')).toContainText('Reviewed');
  });
});
