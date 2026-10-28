import AxeBuilder from '@axe-core/playwright';
import type { Locator, Page } from '@playwright/test';

import { expect, test } from './test.ts';

test.use({ fixture: 'small' });

const MAX_TABS = 300;

/** Presses Tab until `target` has focus, as a keyboard-only reviewer would. */
const tabTo = async (page: Page, target: Locator): Promise<void> => {
  for (let press = 0; press < MAX_TABS; press++) {
    if (await target.evaluate((element) => element === document.activeElement)) {
      return;
    }
    await page.keyboard.press('Tab');
  }
  throw new Error(`Could not reach ${String(target)} with Tab`);
};

const seriousViolations = async (page: Page) => {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id}: ${violation.nodes.length} × ${violation.help}`);
};

test.describe('Keyboard and assistive access', () => {
  test('Keyboard-only review', async ({ page, workspace, review }) => {
    await workspace.open();

    await tabTo(page, workspace.fileRow('money.ts'));
    await page.keyboard.press('Enter');
    await expect(workspace.heading).toHaveText('src/lib/money.ts');

    await tabTo(page, workspace.foldToggle('src/lib/money.ts'));
    await page.keyboard.press('Enter');
    await expect(workspace.foldToggle('src/lib/money.ts')).toHaveAttribute(
      'aria-expanded',
      'false',
    );
    await page.keyboard.press('Enter');

    await tabTo(page, workspace.reviewedCheckbox('src/lib/money.ts'));
    await page.keyboard.press('Space');
    await expect(workspace.reviewedCheckbox('src/lib/money.ts')).toBeChecked();

    await tabTo(page, workspace.sidebarResizer);
    await page.keyboard.press('ArrowRight');
    expect(await workspace.sidebarWidth()).toBe(384);

    await tabTo(page, review.lineButton('src/lib/money.ts', 'new', 9));
    await expect(review.lineButton('src/lib/money.ts', 'new', 9)).toBeVisible();
    await page.keyboard.press('Enter');
    await page.keyboard.type('Typed without a mouse');
    await tabTo(page, review.saveDraft);
    await page.keyboard.press('Enter');

    await expect(review.draft('src/lib/money.ts:9')).toContainText('Typed without a mouse');
  });

  test('axe finds no serious or critical issues on the workspace', async ({ page, workspace }) => {
    await workspace.open();

    expect(await seriousViolations(page)).toEqual([]);
  });

  test('axe finds no serious or critical issues with the review drawer and a comment open', async ({
    page,
    workspace,
    review,
  }) => {
    await workspace.open();
    await review.addComment('src/lib/money.ts', 'new', 9, 'A comment');
    await review.lineButton('src/lib/money.ts', 'new', 10).click();
    await review.openDrawer();

    expect(await seriousViolations(page)).toEqual([]);
  });
});

test.describe('Map view', () => {
  test('axe finds no serious or critical issues on the Map with the drawer open', async ({
    page,
    workspace,
    map,
  }) => {
    await workspace.open();
    await map.open();
    await map.level('Code').click();
    await map.node('formatMoney').click();
    await expect(map.closePanel).toBeVisible();

    expect(await seriousViolations(page)).toEqual([]);
  });
});

test.describe('start screen', () => {
  test.use({ fixture: null });

  test('axe finds no serious or critical issues on the repository picker', async ({
    page,
    appPage,
  }) => {
    await appPage.openWithStartUrl();
    await expect(appPage.heading).toHaveText('Open a repository');

    expect(await seriousViolations(page)).toEqual([]);
  });
});

test.describe('Supported viewport', () => {
  test.use({ viewport: { width: 1024, height: 768 } });

  test('Minimum width', async ({ page, workspace }) => {
    await workspace.open();

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBe(0);
    expect(await workspace.sidebarWidth()).toBe(360);
  });
});
