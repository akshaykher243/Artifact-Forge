import { expect, test } from './test.ts';

test.use({ fixture: 'small' });

test.describe('Layout matches the artifact', () => {
  test('Header for all files', async ({ workspace }) => {
    await workspace.open();

    await expect(workspace.crumb).toContainText('All files');
    await expect(workspace.heading).toHaveText('11 changed files');
    await expect(workspace.crumb).toContainText('feature/multi-currency vs main');
    await expect(workspace.sections).toHaveCount(11);
  });
});

test.describe('File selection and sections', () => {
  test('Focus and return', async ({ workspace }) => {
    await workspace.open();

    await workspace.fileRow('money.ts').click();

    await expect(workspace.crumb).toContainText('Changed file');
    await expect(workspace.heading).toHaveText('src/lib/money.ts');
    await expect(workspace.sections).toHaveCount(1);
    await expect(workspace.fileRow('money.ts')).toHaveAttribute('aria-current', 'true');

    await workspace.backToAllFiles.click();

    await expect(workspace.sections).toHaveCount(11);
    await expect(workspace.heading).toHaveText('11 changed files');
  });
});

test.describe('File tree', () => {
  test('Folder chain compression', async ({ workspace }) => {
    await workspace.open();

    await expect(workspace.folderRow('app/orders/[id]')).toBeVisible();
    await expect(workspace.folderRow('app')).toHaveCount(0);
  });

  test('Collapse a folder', async ({ workspace }) => {
    await workspace.open();

    await workspace.folderRow('src').click();

    await expect(workspace.folderRow('src')).toHaveAttribute('aria-expanded', 'false');
    await expect(workspace.folderRow('src')).toContainText('▸');
    await expect(workspace.fileRow('routes.ts')).toHaveCount(0);
    await expect(workspace.fileRow('money.md')).toBeVisible();
  });

  test('Long paths', async ({ workspace }) => {
    await workspace.open();
    await workspace.sidebarResizer.focus();
    for (let press = 0; press < 3; press++) {
      await workspace.page.keyboard.press('Shift+ArrowLeft');
    }

    const row = workspace.fileRow('OrderSummary.tsx');
    await row.scrollIntoViewIfNeeded();
    await expect(row).toHaveAttribute('title', 'web/components/OrderSummary.tsx');
    await expect(row.getByText('+3')).toBeInViewport();
    expect(await workspace.sidebarWidth()).toBe(240);
  });
});

test.describe('Compact mode', () => {
  test('Toggle compact', async ({ workspace }) => {
    await workspace.open();
    await workspace.folderRow('web').click();

    await workspace.compactToggle.click();

    await expect(workspace.compactToggle).toHaveAttribute('aria-pressed', 'true');
    await expect(workspace.tree.locator('[aria-expanded]')).toHaveCount(0);
    await expect(workspace.tree.getByRole('button')).toHaveCount(11);
    await expect(workspace.fileRow('page.tsx')).toBeVisible();

    await workspace.compactToggle.click();

    await expect(workspace.folderRow('web')).toHaveAttribute('aria-expanded', 'false');
    await expect(workspace.fileRow('page.tsx')).toHaveCount(0);
  });
});

test.describe('Section header', () => {
  test('Fold a section', async ({ workspace }) => {
    await workspace.open();
    const section = workspace.section('docs/money.md');
    await expect(section.getByText('# Money').first()).toBeVisible();

    await workspace.foldToggle('docs/money.md').click();

    await expect(workspace.foldToggle('docs/money.md')).toHaveAccessibleName(
      'Unfold docs/money.md',
    );
    await expect(workspace.foldToggle('docs/money.md')).toHaveAttribute('aria-expanded', 'false');
    await expect(section.getByText('# Money')).toHaveCount(0);
    await expect(workspace.reviewedCheckbox('docs/money.md')).not.toBeChecked();
  });
});

test.describe('Progress row', () => {
  test('Progress updates on review', async ({ workspace }) => {
    await workspace.open();
    await expect(workspace.remaining).toContainText('Remaining+43−24');

    await workspace.reviewedCheckbox('docs/money.md').check();

    await expect(workspace.remaining).toContainText('Remaining+42−23');
    await expect(workspace.progress).toHaveText('3%');
    await expect(workspace.fileRow('money.md')).toContainText('Reviewed');
  });

  test('Empty comparison', async ({ workspace, page }) => {
    await page.route('**/api/op/compare', async (route) => {
      const response = await route.fetch();
      const body = await response.json();
      await route.fulfill({ response, json: { ...body, data: { ...body.data, files: [] } } });
    });

    await workspace.open();

    await expect(workspace.progress).toHaveText('0%');
    await expect(workspace.remaining).toContainText('Remaining+0−0');
    await expect(
      page.getByText('No changes between main and feature/multi-currency.'),
    ).toBeVisible();
  });
});

test.describe('Reviewed marks', () => {
  test('marks a file reviewed everywhere it appears and unmarks it', async ({ workspace }) => {
    await workspace.open();

    await workspace.reviewedCheckbox('src/lib/money.ts').check();
    await workspace.fileRow('money.ts').click();

    await expect(workspace.reviewedCheckbox('src/lib/money.ts')).toBeChecked();
    await workspace.reviewedCheckbox('src/lib/money.ts').uncheck();
    await expect(workspace.fileRow('money.ts')).toContainText('+9');
  });
});

test.describe('Resizable sidebar', () => {
  test('Keyboard resize clamps', async ({ workspace, page }) => {
    await workspace.open();
    const handle = await workspace.sidebarResizer.boundingBox();
    if (handle === null) {
      throw new Error('Resizer is not visible');
    }
    const x = handle.x + handle.width / 2;
    const y = handle.y + handle.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 390, y);
    await page.mouse.up();
    expect(await workspace.sidebarWidth()).toBe(750);

    await workspace.sidebarResizer.focus();
    await page.keyboard.press('Shift+ArrowRight');

    expect(await workspace.sidebarWidth()).toBe(760);
  });

  test('steps by 24 pixels and resets on double-click', async ({ workspace, page }) => {
    await workspace.open();
    await workspace.sidebarResizer.focus();

    await page.keyboard.press('ArrowLeft');
    expect(await workspace.sidebarWidth()).toBe(336);

    await workspace.sidebarResizer.dblclick();
    expect(await workspace.sidebarWidth()).toBe(360);
  });
});
