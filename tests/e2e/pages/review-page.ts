import type { Locator, Page } from '@playwright/test';

import type { WorkspacePage } from './workspace-page.ts';

/** Inline comments and the review drawer, on top of the workspace page. */
export class ReviewPage {
  readonly toggle: Locator;
  readonly drawer: Locator;
  readonly overall: Locator;
  readonly pending: Locator;
  readonly saveDraft: Locator;
  readonly cancel: Locator;
  readonly nextComment: Locator;
  readonly previousComment: Locator;

  constructor(
    readonly page: Page,
    private readonly workspace: WorkspacePage,
  ) {
    this.toggle = page.getByRole('button', { name: /^Review/ });
    this.drawer = page.getByRole('complementary', { name: 'Review' });
    this.overall = page.getByRole('textbox', { name: 'Overall comment' });
    this.pending = this.drawer
      .getByRole('region', { name: 'Pending comments' })
      .getByRole('listitem');
    this.saveDraft = page.getByRole('button', { name: 'Save draft' });
    this.cancel = page.getByRole('button', { name: 'Cancel' });
    this.nextComment = page.getByRole('button', { name: 'Next comment' });
    this.previousComment = page.getByRole('button', { name: 'Previous comment' });
  }

  lineButton = (path: string, side: 'old' | 'new', line: number): Locator =>
    this.workspace
      .section(path)
      .getByRole('button', { name: `Comment on ${side} line ${line}`, exact: true });

  commentBox = (location: string): Locator => this.page.getByLabel(`Comment on ${location}`);

  draft = (location: string, state = 'Draft'): Locator =>
    this.page.getByLabel(`${state} comment on ${location}`, { exact: true });

  /** Opens a comment on one line (or a range, with `to`), types it and saves it. */
  addComment = async (
    path: string,
    side: 'old' | 'new',
    line: number,
    text: string,
    to?: number,
  ): Promise<void> => {
    await this.lineButton(path, side, line).click();
    if (to !== undefined) {
      await this.lineButton(path, side, to).click({ modifiers: ['Shift'] });
    }
    await this.page.getByRole('textbox', { name: /^Comment on / }).fill(text);
    await this.saveDraft.click();
  };

  /** Presses a line's comment button and drags to another line, as on GitHub. */
  dragLines = async (
    path: string,
    side: 'old' | 'new',
    from: number,
    to: number,
  ): Promise<void> => {
    const start = this.lineButton(path, side, from);
    await start.hover();
    await this.page.mouse.down();
    const target = await this.lineButton(path, side, to).locator('..').boundingBox();
    if (target === null) {
      throw new Error(`Line ${to} of ${path} is not on screen`);
    }
    await this.page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, {
      steps: 8,
    });
    await this.page.mouse.up();
  };

  openDrawer = async (): Promise<void> => {
    if ((await this.toggle.getAttribute('aria-pressed')) !== 'true') {
      await this.toggle.click();
    }
  };
}
