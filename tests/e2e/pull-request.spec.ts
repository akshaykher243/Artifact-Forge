import {
  authStatusRule,
  prViewRule,
  readFakeGhCalls,
  writeFakeGhRules,
} from '../fixtures/fake-gh.ts';
import type { FakeGhRule } from '../fixtures/fake-gh.ts';
import { makePrSetup, PR_NUMBER } from '../fixtures/pr-remote.ts';
import type { PrSetup } from '../fixtures/pr-remote.ts';
import type { RunningApp } from '../fixtures/app-server.ts';
import type { AppPage } from './pages/app-page.ts';
import { expect, test } from './test.ts';

const openPrPicker = async (appPage: AppPage, setup: PrSetup): Promise<void> => {
  await appPage.openWithStartUrl();
  await appPage.openRepository(setup.clone);
  await expect(appPage.page.getByRole('form', { name: 'Pull request' })).toBeVisible();
};

const reviewPr = async (appPage: AppPage, number: string): Promise<void> => {
  await appPage.page.getByLabel('Pull request number').fill(number);
  await appPage.page.getByRole('button', { name: 'Review pull request' }).click();
};

const prepare = async (
  app: RunningApp,
  rules: (setup: PrSetup) => FakeGhRule[],
): Promise<PrSetup> => {
  const setup = await makePrSetup(app.root);
  await writeFakeGhRules(app.ghHome, rules(setup));
  return setup;
};

test.describe('Identify the target PR', () => {
  test('Valid PR: fetches and compares it, and shows its details', async ({
    app,
    appPage,
    workspace,
    page,
  }) => {
    const setup = await prepare(app, (s) => [
      authStatusRule('octo-reviewer'),
      prViewRule({ number: PR_NUMBER, baseRefOid: s.baseSha, headRefOid: s.headSha }),
    ]);
    await openPrPicker(appPage, setup);
    await expect(page.getByText('Signed in to GitHub as octo-reviewer.')).toBeVisible();

    await reviewPr(appPage, String(PR_NUMBER));

    const summary = page.getByRole('region', { name: 'Pull request' });
    await expect(summary).toContainText('acme/platform #42');
    await expect(summary).toContainText('Open');
    await expect(summary).toContainText('Add multi-currency support');
    await expect(summary).toContainText(`main ← feature · ${setup.headSha.slice(0, 7)}`);
    await expect(workspace.heading).toHaveText('2 changed files');
    await setup.remove();
  });

  test('Invalid number: the button stays disabled and gh is not asked', async ({
    app,
    appPage,
    page,
  }) => {
    const setup = await prepare(app, () => [authStatusRule('octo-reviewer')]);
    await openPrPicker(appPage, setup);

    for (const value of ['0', 'abc', '-3', '4.2']) {
      await page.getByLabel('Pull request number').fill(value);
      await expect(page.getByRole('button', { name: 'Review pull request' })).toBeDisabled();
    }

    const calls = await readFakeGhCalls(app.ghHome);
    expect(calls.every((call) => call.args[0] === 'auth')).toBe(true);
    await setup.remove();
  });

  test('Not found or no access: shows gh’s message', async ({ app, appPage }) => {
    const setup = await prepare(app, () => [
      authStatusRule('octo-reviewer'),
      {
        args: ['pr', 'view'],
        exitCode: 1,
        stderr: 'GraphQL: Could not resolve to a PullRequest with the number of 7.',
      },
    ]);
    await openPrPicker(appPage, setup);

    await reviewPr(appPage, '7');

    await expect(appPage.error).toHaveText(
      'GraphQL: Could not resolve to a PullRequest with the number of 7.',
    );
    await setup.remove();
  });

  test('Closed or merged PR: shows its state', async ({ app, appPage, page }) => {
    const setup = await prepare(app, (s) => [
      authStatusRule('octo-reviewer'),
      prViewRule({
        number: PR_NUMBER,
        state: 'MERGED',
        baseRefOid: s.baseSha,
        headRefOid: s.headSha,
      }),
    ]);
    await openPrPicker(appPage, setup);

    await reviewPr(appPage, String(PR_NUMBER));

    await expect(page.getByRole('region', { name: 'Pull request' })).toContainText('Merged');
    await setup.remove();
  });

  test('Not signed in: the review still works, without asking gh about the PR', async ({
    app,
    appPage,
    workspace,
    page,
  }) => {
    const setup = await prepare(app, () => [authStatusRule(null)]);
    await openPrPicker(appPage, setup);
    await expect(
      page.getByText('gh is not signed in. Run gh auth login in a terminal to post reviews.'),
    ).toBeVisible();

    await reviewPr(appPage, String(PR_NUMBER));

    await expect(workspace.heading).toHaveText('2 changed files');
    await expect(page.getByRole('region', { name: 'Pull request' })).toContainText('main ← #42');
    const calls = await readFakeGhCalls(app.ghHome);
    expect(calls.some((call) => call.args[0] === 'pr')).toBe(false);
    await setup.remove();
  });
});

test.describe('Outdated drafts', () => {
  test('Moved or changed line: a comment goes outdated after new commits, and can be moved', async ({
    app,
    appPage,
    review,
    page,
  }) => {
    const setup = await prepare(app, () => [authStatusRule(null)]);
    await openPrPicker(appPage, setup);
    await reviewPr(appPage, String(PR_NUMBER));
    await review.addComment('src/money.ts', 'new', 1, 'Name it toMinor?');
    await expect(review.draft('src/money.ts:1')).toBeVisible();

    await setup.pushToPr({
      'src/money.ts': 'export const toMinor = (amount: number) => Math.round(amount * 100);\n',
    });
    await page.getByRole('button', { name: 'Refresh' }).click();

    const outdated = review.draft('src/money.ts:1', 'Outdated');
    await expect(outdated).toContainText('Name it toMinor?');
    await outdated.getByRole('button', { name: 'Move here' }).click();
    await review.lineButton('src/money.ts', 'new', 1).click();

    await expect(review.draft('src/money.ts:1')).toContainText('Name it toMinor?');
    await expect(review.draft('src/money.ts:1', 'Outdated')).toHaveCount(0);
    await setup.remove();
  });

  test('Unchanged line: a comment stays a draft when new commits do not touch it', async ({
    app,
    appPage,
    review,
    page,
  }) => {
    const setup = await prepare(app, () => [authStatusRule(null)]);
    await openPrPicker(appPage, setup);
    await reviewPr(appPage, String(PR_NUMBER));
    await review.addComment('src/money.ts', 'new', 1, 'Fine as is');
    await expect(review.draft('src/money.ts:1')).toBeVisible();

    await setup.pushToPr({ 'src/other.ts': 'export const other = 1;\n' });
    await page.getByRole('button', { name: 'Refresh' }).click();

    await expect(page.getByRole('heading', { level: 1 })).toHaveText('3 changed files');
    await expect(review.draft('src/money.ts:1')).toContainText('Fine as is');
    await setup.remove();
  });
});
