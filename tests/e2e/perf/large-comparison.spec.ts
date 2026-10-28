import { makeRepo } from '../../fixtures/repo-builder.ts';
import type { Page } from '@playwright/test';

import { expect, test } from '../test.ts';

// Runs in its own Playwright project after every other spec, so timings are not skewed by
// parallel workers.
const FILE_COUNT = 1_000;

/** Records how long the browser spent on each key event (processing plus next paint). */
const watchKeyEvents = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const durations: number[] = [];
    Object.assign(window, { keyEventDurations: durations });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'keydown' || entry.name === 'input') {
          durations.push(entry.duration);
        }
      }
    }).observe({ type: 'event', durationThreshold: 0 } as PerformanceObserverInit);
  });

const keyEventStats = async (page: Page): Promise<{ median: number; max: number }> => {
  const durations = await page.evaluate(() =>
    [...(window as unknown as { keyEventDurations: number[] }).keyEventDurations].sort(
      (a, b) => a - b,
    ),
  );
  return { median: durations[Math.floor(durations.length / 2)] ?? 0, max: durations.at(-1) ?? 0 };
};
const LIST_BUDGET_MS = 1_500;
const KEYSTROKE_BUDGET_MS = 50;

test.describe('Large comparison', () => {
  test(`Large comparison: ${FILE_COUNT} files load and stay responsive`, async ({
    appPage,
    workspace,
    review,
    app,
    page,
  }) => {
    const repo = await makeRepo(app.root);
    await repo.commit('base', { 'README.md': '# big\n' });
    repo.git('switch', '--quiet', '-c', 'wide');
    const files = Object.fromEntries(
      Array.from({ length: FILE_COUNT }, (_, i) => [
        `packages/p${Math.floor(i / 50)}/src/file-${i}.ts`,
        `export const value${i} = ${i};\n`,
      ]),
    );
    await repo.commit('wide', files);
    await appPage.openWithStartUrl();
    await appPage.openRepository(repo.path);
    await page.getByLabel('Head').fill('wide');

    const response = page.waitForResponse('**/api/op/compare');
    await page.getByRole('button', { name: 'Compare' }).click();
    await response;
    const responded = Date.now();
    await expect(workspace.heading).toHaveText(`${FILE_COUNT} changed files`);
    await expect(workspace.fileRow('file-999.ts')).toBeAttached();
    const listMs = Date.now() - responded;

    const filter = page.getByLabel('Filter files');
    await filter.focus();
    await watchKeyEvents(page);
    await page.keyboard.type('file-99');
    await expect(page.getByText(`Files, 11 of ${FILE_COUNT}`)).toBeVisible();
    const filterKeys = await keyEventStats(page);

    // With every section on screen again, type into a comment box.
    await filter.fill('');
    await expect(page.getByText(`Files, ${FILE_COUNT}`, { exact: true })).toBeVisible();
    await review.lineButton('packages/p0/src/file-0.ts', 'new', 1).click();
    const comment = review.commentBox('packages/p0/src/file-0.ts:1');
    await comment.focus();
    await watchKeyEvents(page);
    await page.keyboard.type('Looks fine');
    await expect(comment).toHaveValue('Looks fine');
    const commentKeys = await keyEventStats(page);

    test.info().annotations.push({
      type: 'timing',
      description:
        `list ${listMs} ms; filter keys median ${filterKeys.median} ms, max ${filterKeys.max} ms; ` +
        `comment keys median ${commentKeys.median} ms, max ${commentKeys.max} ms`,
    });
    expect(listMs).toBeLessThan(LIST_BUDGET_MS);
    expect(filterKeys.median).toBeLessThan(KEYSTROKE_BUDGET_MS);
    expect(commentKeys.median).toBeLessThan(KEYSTROKE_BUDGET_MS);
  });
});
