import { chmod, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { startApp } from '../fixtures/app-server.ts';
import { expect, test } from './test.ts';

test.use({ fixture: 'small' });

const MONEY = 'src/lib/money.ts';

test.describe('Inline comment on a line or range', () => {
  test('Single line', async ({ workspace, review }) => {
    await workspace.open();

    await review.addComment(MONEY, 'new', 9, 'Check rounding for JPY');

    await expect(review.draft(`${MONEY}:9`)).toContainText('Check rounding for JPY');
    await review.openDrawer();
    await expect(review.pending).toHaveCount(1);
    await expect(review.pending.first()).toContainText(`${MONEY}:9`);
  });

  test('Range', async ({ workspace, review }) => {
    await workspace.open();

    await review.addComment(MONEY, 'new', 9, 'This whole function', 11);

    await expect(review.draft(`${MONEY}:9–11`)).toContainText('This whole function');
  });

  test('Line range by dragging: press + on the first line and drag to the last', async ({
    workspace,
    review,
  }) => {
    await workspace.open();

    await review.dragLines(MONEY, 'new', 1, 5);

    const box = review.commentBox(`${MONEY}:1–5`);
    await expect(box).toBeFocused();
    await box.fill('These five lines');
    await review.saveDraft.click();
    await expect(review.draft(`${MONEY}:1–5`)).toContainText('These five lines');
  });

  test('Line range by dragging upwards picks the same lines', async ({ workspace, review }) => {
    await workspace.open();

    await review.dragLines(MONEY, 'new', 5, 1);

    await expect(review.commentBox(`${MONEY}:1–5`)).toBeVisible();
  });

  test('a drag stays on the side it started on', async ({ workspace, review }) => {
    await workspace.open();

    await review.dragLines(MONEY, 'old', 5, 6);
    await expect(review.commentBox(`${MONEY}:5–6 (old)`)).toBeVisible();
    await review.cancel.click();

    const start = review.lineButton(MONEY, 'new', 9);
    await start.hover();
    await review.page.mouse.down();
    const oldSide = await review.lineButton(MONEY, 'old', 5).locator('..').boundingBox();
    await review.page.mouse.move((oldSide?.x ?? 0) + 5, (oldSide?.y ?? 0) + 5, { steps: 8 });
    await review.page.mouse.up();
    await expect(review.commentBox(`${MONEY}:9`)).toBeVisible();
  });

  test('Range across hunks refused: a range may not span both sides', async ({
    workspace,
    review,
    page,
  }) => {
    await workspace.open();
    await review.lineButton(MONEY, 'new', 9).click();

    await review.lineButton(MONEY, 'old', 5).click({ modifiers: ['Shift'] });

    await expect(workspace.section(MONEY).getByRole('alert')).toHaveText(
      'A range must stay within one hunk on one side.',
    );
    await expect(page.getByLabel(`Comment on ${MONEY}:9`)).toBeVisible();
  });

  test('Empty text refused', async ({ workspace, review }) => {
    await workspace.open();
    await review.lineButton(MONEY, 'new', 9).click();

    await expect(review.saveDraft).toBeDisabled();
    await review.commentBox(`${MONEY}:9`).fill('   \n  ');
    await expect(review.saveDraft).toBeDisabled();
  });
});

test.describe('Overall review comment', () => {
  test('Overall only', async ({ workspace, review, page }) => {
    await workspace.open();
    await review.openDrawer();

    await review.overall.fill('Solid change overall.');

    await expect(review.drawer).toContainText('0 inline comments, overall comment');
    await page.reload();
    await review.openDrawer();
    await expect(review.overall).toHaveValue('Solid change overall.');
  });
});

test.describe('Edit and delete unsent drafts', () => {
  test('Edit', async ({ workspace, review }) => {
    await workspace.open();
    await review.addComment(MONEY, 'new', 9, 'First thought');
    await review.openDrawer();

    await review.draft(`${MONEY}:9`).getByRole('button', { name: 'Edit' }).click();
    await review.commentBox(`${MONEY}:9`).fill('Second thought');
    await review.saveDraft.click();

    await expect(review.draft(`${MONEY}:9`)).toContainText('Second thought');
    await expect(review.pending.first()).toContainText('Second thought');
  });

  test('Delete', async ({ workspace, review }) => {
    await workspace.open();
    await review.addComment(MONEY, 'new', 9, 'Not needed');
    await review.openDrawer();
    const draft = review.draft(`${MONEY}:9`);

    await draft.getByRole('button', { name: 'Delete' }).click();
    await draft
      .getByRole('group', { name: 'Confirm delete' })
      .getByRole('button', { name: 'Delete' })
      .click();

    await expect(draft).toHaveCount(0);
    await expect(review.pending).toHaveCount(0);
  });

  test('Cancel on a new comment discards it', async ({ workspace, review }) => {
    await workspace.open();
    await review.lineButton(MONEY, 'new', 9).click();
    await review.commentBox(`${MONEY}:9`).fill('Never mind');

    await review.cancel.click();

    await expect(review.draft(`${MONEY}:9`)).toHaveCount(0);
    await review.openDrawer();
    await expect(review.pending).toHaveCount(0);
  });
});

test.describe('Pending review list', () => {
  test('Jump to location', async ({ workspace, review }) => {
    await workspace.open();
    await review.addComment(MONEY, 'new', 11, 'Look here');
    await workspace.foldToggle(MONEY).click();
    await review.openDrawer();

    await review.pending.first().getByRole('button').click();

    await expect(workspace.heading).toHaveText(MONEY);
    await expect(review.draft(`${MONEY}:11`)).toBeFocused();
    await expect(review.draft(`${MONEY}:11`)).toBeInViewport();
  });

  test('Next and previous', async ({ workspace, review }) => {
    await workspace.open();
    await review.addComment(MONEY, 'new', 9, 'Second in order');
    await review.addComment('docs/money.md', 'new', 3, 'First in order');
    await review.openDrawer();
    // Commenting again right after saving once created a duplicate of the first draft.
    await expect(review.pending).toHaveCount(2);

    await review.nextComment.click();
    await expect(review.draft('docs/money.md:3')).toBeFocused();
    await review.nextComment.click();
    await expect(review.draft(`${MONEY}:9`)).toBeFocused();
    await review.previousComment.click();
    await expect(review.draft('docs/money.md:3')).toBeFocused();
  });
});

test.describe('Local persistence', () => {
  test('Storage failure', async ({ workspace, review, app }) => {
    await workspace.open();
    await chmod(app.dataDir, 0o500);
    try {
      await review.lineButton(MONEY, 'new', 9).click();
      await review.commentBox(`${MONEY}:9`).fill('This cannot be saved');
      await review.saveDraft.click();

      await expect(workspace.section(MONEY).getByRole('alert')).toHaveText('Draft not saved');
      await expect(review.commentBox(`${MONEY}:9`)).toHaveValue('This cannot be saved');
    } finally {
      await chmod(app.dataDir, 0o700);
    }
  });
});

test.describe('Local and submitted are clearly different', () => {
  test('Labelling', async ({ browser }) => {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'af-e2e-root-')));
    const dataDir = await realpath(await mkdtemp(join(tmpdir(), 'af-e2e-data-')));
    const base = {
      path: MONEY,
      side: 'new',
      headSha: 'd085642',
      updatedAt: '2026-10-26T00:00:00Z',
    };
    await mkdir(join(dataDir, 'reviews'));
    await writeFile(
      join(dataDir, 'reviews', 'comparison-fixture-small.json'),
      JSON.stringify({
        version: 1,
        overall: '',
        drafts: [
          {
            ...base,
            id: '11111111-1111-4111-8111-111111111111',
            startLine: 9,
            endLine: 9,
            anchorText: ['x'],
            body: 'Local only',
            state: 'draft',
            reviewUrl: null,
          },
          {
            ...base,
            id: '22222222-2222-4222-8222-222222222222',
            startLine: 11,
            endLine: 11,
            anchorText: ['y'],
            body: 'Already sent',
            state: 'submitted',
            reviewUrl: 'https://github.com/acme/platform/pull/1#pullrequestreview-1',
          },
        ],
      }),
    );
    const app = await startApp({ fixture: 'small', root, dataDir });
    const page = await browser.newPage();
    await page.goto(app.startUrl);

    const draft = page.getByLabel(`Draft comment on ${MONEY}:9`, { exact: true });
    const submitted = page.getByLabel(`Submitted comment on ${MONEY}:11`, { exact: true });
    await expect(draft).toContainText('Draft');
    await expect(draft.getByRole('button', { name: 'Edit' })).toBeVisible();
    await expect(submitted).toContainText('Submitted');
    await expect(submitted.getByRole('button', { name: 'Edit' })).toHaveCount(0);
    await expect(submitted.getByRole('link', { name: 'View on GitHub' })).toBeVisible();

    await page.close();
    await app.stop();
    await rm(root, { recursive: true, force: true });
    await rm(dataDir, { recursive: true, force: true });
  });
});
