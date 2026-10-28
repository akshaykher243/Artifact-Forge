import type { Page } from '@playwright/test';

import { makeRepo } from '../fixtures/repo-builder.ts';
import { expect, test } from './test.ts';

/** Answers `dependencyMap` with the given map instead of analysing. */
const answerMap = async (page: Page, data: unknown): Promise<void> => {
  await page.route('**/api/op/dependencyMap', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data }),
    }),
  );
};

test.describe('Map view on the sample comparison', () => {
  test.use({ fixture: 'small' });

  test('Switch to the map', async ({ workspace, map }) => {
    await workspace.open();

    await map.open();

    await expect(map.mapTab).toHaveAttribute('aria-pressed', 'true');
    await expect(workspace.heading).toHaveText('feature/multi-currency vs main');
    await expect(workspace.crumb).toContainText('Diff overlay');
    await expect(workspace.crumb).toContainText('prflow-platform, directory map');
    await expect(map.node('formatMoney')).toBeVisible();
    await expect(workspace.sections.first()).toBeHidden();
    await expect(map.page.getByText('11 changed functions')).toBeVisible();
  });

  test('Analysis is not repeated, and the diff is kept as it was', async ({
    page,
    workspace,
    map,
  }) => {
    const requests: string[] = [];
    page.on('request', (request) => {
      if (request.url().endsWith('/api/op/dependencyMap')) {
        requests.push(request.url());
      }
    });
    await workspace.open();
    await workspace.fileRow('money.ts').click();

    await map.open();
    await expect(map.node('formatMoney')).toBeVisible();
    await map.diffTab.click();
    await expect(workspace.heading).toHaveText('src/lib/money.ts');
    await map.open();
    await expect(map.node('formatMoney')).toBeVisible();

    expect(requests).toHaveLength(1);
  });

  test('Change level', async ({ workspace, map }) => {
    await workspace.open();
    await map.open();
    const moduleEdges = await map.edges.count();

    await map.level('Package').click();

    await expect(map.level('Package')).toHaveAttribute('aria-pressed', 'true');
    await expect(map.node('money.ts')).toContainText('2 functions');
    await expect(map.node('formatMoney')).toHaveCount(0);
    expect(await map.edges.count()).toBeGreaterThan(0);
    expect(await map.edges.count()).toBeLessThan(moduleEdges);
  });

  test('Zoom limits', async ({ workspace, map }) => {
    await workspace.open();
    await map.open();

    for (let press = 0; press < 9; press += 1) {
      await map.zoomIn.click();
    }

    await expect(map.zoomReset).toHaveText('160%');
    await map.zoomReset.click();
    await expect(map.zoomReset).toHaveText('100%');
    for (let press = 0; press < 9; press += 1) {
      await map.zoomOut.click();
    }
    await expect(map.zoomReset).toHaveText('50%');
  });

  test('Overlay off', async ({ workspace, map }) => {
    await workspace.open();
    await map.open();

    await map.overlay.click();

    await expect(map.overlay).toHaveAttribute('aria-pressed', 'false');
    await expect(map.node('formatMoney')).not.toContainText('+3');
    const borders = await map.nodes.evaluateAll((nodes) =>
      nodes.map((node) => getComputedStyle(node).borderTopColor),
    );
    expect(new Set(borders)).toEqual(new Set(['rgb(58, 69, 104)']));
  });

  test('Caller left of callee', async ({ workspace, map }) => {
    await workspace.open();
    await map.open();

    const caller = await map.boxLabel('web/components').boundingBox();
    const callee = await map.boxLabel('src/lib').boundingBox();

    expect(caller?.x).toBeLessThan(callee?.x ?? 0);
  });

  test('From map to diff', async ({ workspace, map }) => {
    await workspace.open();
    await map.open();

    await map.node('formatMoney').click();
    await expect(map.node('formatMoney')).toHaveAttribute('aria-pressed', 'true');
    await expect(map.page.getByText('src/lib/money.ts:9')).toBeVisible();
    await map.openInDiff.click();

    await expect(map.diffTab).toHaveAttribute('aria-pressed', 'true');
    await expect(workspace.heading).toHaveText('src/lib/money.ts');
    await expect(workspace.sections).toHaveCount(1);
  });

  test('Reviewed from the map', async ({ workspace, map }) => {
    await workspace.open();
    await map.open();
    await map.level('Package').click();
    await map.node('money.ts').click();

    await map.markReviewed.check();

    await expect(workspace.fileRow('money.ts')).toContainText('Reviewed');
    await map.level('Module').click();
    await expect(map.node('formatMoney')).toContainText('✓');
    await map.diffTab.click();
    await expect(workspace.reviewedCheckbox('src/lib/money.ts')).toBeChecked();
  });

  test('a folder lists its files, and picking one selects it at Package level', async ({
    workspace,
    map,
  }) => {
    await workspace.open();
    await map.open();
    await map.level('Architecture').click();
    await map.node('src/lib').click();

    await map.page.getByRole('complementary', { name: 'src/lib' }).getByText('money.ts').click();

    await expect(map.level('Package')).toHaveAttribute('aria-pressed', 'true');
    await expect(map.node('money.ts')).toHaveAttribute('aria-pressed', 'true');
  });

  test('a sidebar pick in the Map view selects the file at Package level', async ({
    workspace,
    map,
  }) => {
    await workspace.open();
    await map.open();

    await workspace.fileRow('payments.ts').click();

    await expect(map.level('Package')).toHaveAttribute('aria-pressed', 'true');
    await expect(map.node('payments.ts')).toHaveAttribute('aria-pressed', 'true');
    await map.closePanel.click();
    await expect(map.node('payments.ts')).toHaveAttribute('aria-pressed', 'false');
  });

  test('Toggle the panel', async ({ workspace, map }) => {
    await workspace.open();
    await map.open();
    await expect(map.page.getByText('Showing all of feature/multi-currency')).toBeVisible();
    const before = (await map.canvas.boundingBox())?.width ?? 0;

    await map.gitToggle.click();

    await expect(map.gitPanel).toBeHidden();
    await expect(map.gitToggle).toHaveAttribute('aria-pressed', 'false');
    expect((await map.canvas.boundingBox())?.width).toBeGreaterThan(before);
  });
});

test.describe('Map states', () => {
  test.use({ fixture: 'small' });

  test('Analysing: the canvas says how many files are analysed', async ({
    page,
    workspace,
    map,
  }) => {
    await page.route('**/api/op/dependencyMap', () => {
      // Never answered, so the map stays in analysis.
    });
    await workspace.open();
    await map.open();

    await expect(map.status).toHaveText('Analysing 9 files…');
    await expect(map.boxLabel('money.ts')).toBeVisible();
  });

  test('Too large', async ({ page, workspace, map }) => {
    await answerMap(page, { state: 'tooLarge', sourceFileCount: 3001 });
    await workspace.open();
    await map.open();

    await expect(map.status).toHaveText(
      'Repository too large for the map (3,001 source files; the limit is 3,000).',
    );
  });

  test('a failed analysis shows its message and no boxes', async ({ page, workspace, map }) => {
    await answerMap(page, {
      state: 'failed',
      message: 'The analysis took longer than 60 seconds.',
    });
    await workspace.open();
    await map.open();

    await expect(map.status).toHaveText('The analysis took longer than 60 seconds.');
    await expect(map.boxLabel('money.ts')).toHaveCount(0);
  });
});

test.describe('Map states on a repository', () => {
  test('Only documentation changed', async ({ appPage, workspace, map, app, page }) => {
    const repo = await makeRepo(app.root);
    await repo.commit('base', { 'docs/guide.md': '# Guide\n', 'src/a.ts': 'export {};\n' });
    repo.git('switch', '--quiet', '-c', 'feature/docs');
    await repo.commit('docs', { 'docs/guide.md': '# Guide\n\nMore.\n' });
    await appPage.openWithStartUrl();
    await appPage.openRepository(repo.path);
    await page.getByRole('button', { name: 'Compare' }).click();
    await expect(workspace.heading).toHaveText('1 changed file');

    await map.open();

    await expect(map.status).toHaveText('No TypeScript or JavaScript changes to map.');
    await expect(map.boxLabel('guide.md')).toBeVisible();
  });
});
