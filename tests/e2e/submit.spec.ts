import type { Page } from '@playwright/test';

import type { RunningApp } from '../fixtures/app-server.ts';
import {
  authStatusRule,
  prViewRule,
  readFakeGhCalls,
  writeFakeGhRules,
} from '../fixtures/fake-gh.ts';
import type { FakeGhRule } from '../fixtures/fake-gh.ts';
import { makePrSetup, PR_NUMBER } from '../fixtures/pr-remote.ts';
import { snapshotRepo } from '../fixtures/repo-builder.ts';
import type { PrSetup } from '../fixtures/pr-remote.ts';
import type { AppPage } from './pages/app-page.ts';
import type { ReviewPage } from './pages/review-page.ts';
import { expect, test } from './test.ts';

const REVIEW_URL = 'https://github.com/acme/platform/pull/42#pullrequestreview-9001';
const created: FakeGhRule = {
  args: ['api'],
  stdout: JSON.stringify({ id: 9001, html_url: REVIEW_URL }),
};

interface Opened {
  setup: PrSetup;
  /** Replaces the fake gh's answers; auth status and pr view are always included. */
  rules: (
    extra: FakeGhRule[],
    prState?: 'OPEN' | 'CLOSED' | 'MERGED',
    headRefOid?: string,
  ) => Promise<void>;
}

/** Opens PR #42 for review with a signed-in fake gh. */
const openPullRequest = async (app: RunningApp, appPage: AppPage, page: Page): Promise<Opened> => {
  const setup = await makePrSetup(app.root);
  const rules: Opened['rules'] = (extra, prState = 'OPEN', headRefOid = setup.headSha) =>
    writeFakeGhRules(app.ghHome, [
      authStatusRule('octo-reviewer'),
      ...extra,
      prViewRule({ number: PR_NUMBER, state: prState, baseRefOid: setup.baseSha, headRefOid }),
    ]);
  await rules([]);
  await appPage.openWithStartUrl();
  await appPage.openRepository(setup.clone);
  await page.getByLabel('Pull request number').fill(String(PR_NUMBER));
  await page.getByRole('button', { name: 'Review pull request' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('2 changed files');
  return { setup, rules };
};

const apiCalls = async (app: RunningApp) =>
  (await readFakeGhCalls(app.ghHome)).filter((call) => call.args[0] === 'api');

const startPosting = async (review: ReviewPage, page: Page): Promise<void> => {
  await review.addComment('src/money.ts', 'new', 1, 'Rename to toMinor?');
  await review.openDrawer();
  await page.getByRole('button', { name: 'Post review…' }).click();
};

test.describe('Explicit confirmation', () => {
  test('shows what will be posted, where and as whom', async ({ app, appPage, review, page }) => {
    const { setup, rules } = await openPullRequest(app, appPage, page);
    await rules([created]);

    await startPosting(review, page);

    const dialog = page.getByRole('dialog', { name: 'Post this review to GitHub?' });
    await expect(dialog).toContainText('acme/platform #42 · Add multi-currency support');
    await expect(dialog).toContainText(`main ← feature · ${setup.headSha.slice(0, 7)}`);
    await expect(dialog).toContainText('Comment');
    await expect(dialog).toContainText('octo-reviewer');
    await expect(dialog).toContainText('1 inline comment, no overall comment');
    await setup.remove();
  });

  test('Cancel: posts nothing and keeps the draft', async ({ app, appPage, review, page }) => {
    const { setup, rules } = await openPullRequest(app, appPage, page);
    await rules([created]);
    await startPosting(review, page);

    await page.getByRole('dialog').getByRole('button', { name: 'Cancel' }).click();

    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(review.draft('src/money.ts:1')).toBeVisible();
    expect(await apiCalls(app)).toEqual([]);
    await setup.remove();
  });

  test('Nothing to send: posting is unavailable', async ({ app, appPage, review, page }) => {
    const { setup } = await openPullRequest(app, appPage, page);
    await review.openDrawer();

    await expect(page.getByRole('button', { name: 'Post review…' })).toBeDisabled();
    await expect(page.getByText('Write a comment or an overall comment first.')).toBeVisible();
    await setup.remove();
  });

  test('Closed or merged PR: posting needs an extra acknowledgement', async ({
    app,
    appPage,
    review,
    page,
  }) => {
    const { setup, rules } = await openPullRequest(app, appPage, page);
    await rules([created], 'MERGED');
    await startPosting(review, page);
    const dialog = page.getByRole('dialog');

    await expect(dialog.getByRole('button', { name: 'Post review' })).toBeDisabled();
    await dialog.getByLabel('This pull request is merged. Post anyway.').check();
    await expect(dialog.getByRole('button', { name: 'Post review' })).toBeEnabled();
    await setup.remove();
  });
});

test.describe('Comparison must match the PR', () => {
  test('PR moved on: refuses to post and says why', async ({ app, appPage, review, page }) => {
    const { setup, rules } = await openPullRequest(app, appPage, page);
    await rules([created], 'OPEN', 'f'.repeat(40));

    await startPosting(review, page);

    await expect(page.getByRole('region', { name: 'Post review' }).getByRole('alert')).toHaveText(
      'The pull request has new commits. Refresh it and check your comments before posting.',
    );
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await apiCalls(app)).toEqual([]);
    await setup.remove();
  });
});

test.describe('Read-only repository access', () => {
  test('Repository unchanged and Network audit: a whole review session, from opening to posting', async ({
    app,
    appPage,
    review,
    page,
    requestedUrls,
  }) => {
    const setup = await makePrSetup(app.root);
    const before = await snapshotRepo(setup.clone);
    await writeFakeGhRules(app.ghHome, [
      authStatusRule('octo-reviewer'),
      created,
      prViewRule({ number: PR_NUMBER, baseRefOid: setup.baseSha, headRefOid: setup.headSha }),
    ]);
    await appPage.openWithStartUrl();
    await appPage.openRepository(setup.clone);
    await page.getByLabel('Pull request number').fill(String(PR_NUMBER));
    await page.getByRole('button', { name: 'Review pull request' }).click();
    await startPosting(review, page);
    await page.getByRole('dialog').getByRole('button', { name: 'Post review' }).click();
    await expect(page.getByRole('link', { name: 'View it on GitHub' })).toBeVisible();

    expect(await snapshotRepo(setup.clone)).toEqual(before);
    expect(requestedUrls.filter((url) => new URL(url).origin !== app.origin)).toEqual([]);
    await setup.remove();
  });
});

test.describe('Submit as one Comment review', () => {
  test('Success: posts once, links to the review and marks the comment submitted', async ({
    app,
    appPage,
    review,
    page,
  }) => {
    const { setup, rules } = await openPullRequest(app, appPage, page);
    await rules([created]);
    await startPosting(review, page);

    await page.getByRole('dialog').getByRole('button', { name: 'Post review' }).click();

    await expect(page.getByRole('link', { name: 'View it on GitHub' })).toHaveAttribute(
      'href',
      REVIEW_URL,
    );
    await expect(review.draft('src/money.ts:1', 'Submitted')).toBeVisible();
    const calls = await apiCalls(app);
    expect(calls).toHaveLength(1);
    expect(JSON.parse(calls[0]?.stdin ?? '')).toMatchObject({
      event: 'COMMENT',
      commit_id: setup.headSha,
    });
    await setup.remove();
  });

  test('Double click: confirming twice posts exactly once', async ({
    app,
    appPage,
    review,
    page,
  }) => {
    const { setup, rules } = await openPullRequest(app, appPage, page);
    await rules([{ ...created, delayMs: 500 }]);
    await startPosting(review, page);

    await page.getByRole('dialog').getByRole('button', { name: 'Post review' }).dblclick();

    await expect(page.getByRole('link', { name: 'View it on GitHub' })).toBeVisible();
    expect(await apiCalls(app)).toHaveLength(1);
    await setup.remove();
  });

  test('Rejected by GitHub: shows gh’s message, masked, and keeps the draft', async ({
    app,
    appPage,
    review,
    page,
  }) => {
    const { setup, rules } = await openPullRequest(app, appPage, page);
    await rules([
      {
        args: ['api'],
        exitCode: 1,
        stderr: `HTTP 422: pull request review thread line must be part of the diff (token gho_${'Z9'.repeat(20)})`,
      },
    ]);
    await startPosting(review, page);

    await page.getByRole('dialog').getByRole('button', { name: 'Post review' }).click();

    const alert = page.getByRole('region', { name: 'Post review' }).getByRole('alert');
    await expect(alert).toContainText('GitHub did not accept the review: HTTP 422');
    await expect(alert).toContainText('[masked]');
    await expect(alert).not.toContainText('gho_');
    await expect(review.draft('src/money.ts:1')).toBeVisible();
    await setup.remove();
  });

  test('Unexpected output: reports an unknown outcome and offers to check GitHub', async ({
    app,
    appPage,
    review,
    page,
  }) => {
    const { setup, rules } = await openPullRequest(app, appPage, page);
    await rules([{ args: ['api'], stdout: 'garbled' }]);
    await startPosting(review, page);

    await page.getByRole('dialog').getByRole('button', { name: 'Post review' }).click();

    await expect(page.getByText(/^Outcome unknown\./)).toBeVisible();
    await expect(page.getByRole('button', { name: 'Post review…' })).toBeDisabled();
    await rules([
      {
        args: ['pr', 'view', '42', '--repo', 'github.com/acme/platform', '--json', 'reviews'],
        stdout: JSON.stringify({
          reviews: [
            { author: { login: 'octo-reviewer' }, body: '', submittedAt: new Date().toISOString() },
          ],
        }),
      },
    ]);
    await page.getByRole('button', { name: 'Check GitHub for this review' }).click();

    await expect(page.getByText('Review posted.')).toBeVisible();
    expect(await apiCalls(app)).toHaveLength(1);
    await setup.remove();
  });
});
