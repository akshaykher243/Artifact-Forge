import type { Page } from '@playwright/test';

import { makeRepo } from '../fixtures/repo-builder.ts';
import { expect, test } from './test.ts';

const INJECTED = 'Injected failure';

/** Makes one operation fail the way the server reports errors. */
const failOperation = async (page: Page, name: string): Promise<void> => {
  await page.route(`**/api/op/${name}`, (route) =>
    route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ success: false, error: { code: 'internal', message: INJECTED } }),
    }),
  );
};

test.describe('every operation failure is visible (sample data)', () => {
  test.use({ fixture: 'small' });

  test('appInfo: start-up shows the error', async ({ page, app }) => {
    await failOperation(page, 'appInfo');
    await page.goto(app.startUrl);

    await expect(page.getByRole('status')).toHaveText(INJECTED);
  });

  test('fileDiff: the section shows the error instead of lines', async ({ page, workspace }) => {
    await failOperation(page, 'fileDiff');
    await workspace.open();

    await expect(workspace.section('docs/money.md').getByRole('alert')).toHaveText(INJECTED);
  });

  test('reviewMarks: says progress could not be loaded', async ({ page, workspace }) => {
    await failOperation(page, 'reviewMarks');
    await workspace.open();

    await expect(page.getByText('Could not load review progress.')).toBeVisible();
  });

  test('setReviewed: says progress could not be saved and undoes the mark', async ({
    page,
    workspace,
  }) => {
    await workspace.open();
    await failOperation(page, 'setReviewed');

    // click, not check: the app rightly unchecks the box again when saving fails.
    await workspace.reviewedCheckbox('docs/money.md').click();

    await expect(page.getByText('Could not save review progress.')).toBeVisible();
    await expect(workspace.reviewedCheckbox('docs/money.md')).not.toBeChecked();
  });

  test('loadReview: says saved comments could not be loaded', async ({ page, workspace }) => {
    await failOperation(page, 'loadReview');
    await workspace.open();

    await expect(
      page.getByRole('alert').filter({ hasText: 'Could not load your saved comments.' }),
    ).toBeVisible();
  });

  test('saveDraft: keeps the text and says it was not saved', async ({
    page,
    workspace,
    review,
  }) => {
    await workspace.open();
    await failOperation(page, 'saveDraft');

    await review.lineButton('src/lib/money.ts', 'new', 9).click();
    await review.commentBox('src/lib/money.ts:9').fill('Will not save');
    await review.saveDraft.click();

    await expect(workspace.section('src/lib/money.ts').getByRole('alert')).toHaveText(
      'Draft not saved',
    );
  });

  test('deleteDraft: says the draft is still saved', async ({ page, workspace, review }) => {
    await workspace.open();
    await review.addComment('src/lib/money.ts', 'new', 9, 'Keep me');
    await failOperation(page, 'deleteDraft');
    const draft = review.draft('src/lib/money.ts:9');

    await draft.getByRole('button', { name: 'Delete' }).click();
    await draft
      .getByRole('group', { name: 'Confirm delete' })
      .getByRole('button', { name: 'Delete' })
      .click();

    await expect(page.getByText('Could not delete the draft. It is still saved.')).toBeVisible();
    await expect(draft).toBeVisible();
  });

  test('saveOverall: says the overall comment was not saved', async ({
    page,
    workspace,
    review,
  }) => {
    await workspace.open();
    await failOperation(page, 'saveOverall');
    await review.openDrawer();

    await review.overall.fill('Will not save');

    await expect(review.drawer.getByRole('alert')).toHaveText('Draft not saved');
  });

  test('Post review without a pull request explains how to get one', async ({
    workspace,
    review,
    page,
  }) => {
    await workspace.open();
    await review.openDrawer();

    await expect(
      page.getByText('Open this comparison as a pull request to post a review to GitHub.'),
    ).toBeVisible();
  });
});

test.describe('every operation failure is visible (repository)', () => {
  test('recentRepos: says recents could not be read, and the picker still works', async ({
    page,
    appPage,
  }) => {
    await failOperation(page, 'recentRepos');
    await appPage.openWithStartUrl();

    await expect(page.getByText('Recent repositories could not be read.')).toBeVisible();
    await expect(appPage.repositoryPath).toBeEnabled();
  });

  test('openRepo: shows the error on the picker', async ({ page, appPage, app }) => {
    const repo = await makeRepo(app.root);
    await failOperation(page, 'openRepo');
    await appPage.openWithStartUrl();

    await appPage.openRepository(repo.path);

    await expect(appPage.error).toHaveText(INJECTED);
  });

  test('listRefs: shows the error instead of the refs', async ({ page, appPage, app }) => {
    const repo = await makeRepo(app.root);
    await repo.commit('first', { 'a.txt': 'a\n' });
    await failOperation(page, 'listRefs');
    await appPage.openWithStartUrl();

    await appPage.openRepository(repo.path);

    await expect(appPage.status).toHaveText(INJECTED);
  });

  test('compare: shows the error and keeps the picker', async ({ page, appPage, app }) => {
    const repo = await makeRepo(app.root);
    await repo.commit('first', { 'a.txt': 'a\n' });
    repo.git('branch', 'other');
    await failOperation(page, 'compare');
    await appPage.openWithStartUrl();
    await appPage.openRepository(repo.path);

    await page.getByLabel('Head').fill('other');
    await page.getByRole('button', { name: 'Compare' }).click();

    await expect(appPage.error).toHaveText(INJECTED);
  });
});
