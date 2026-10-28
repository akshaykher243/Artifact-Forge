import type { Locator, Page } from '@playwright/test';

import type { RunningApp } from '../../fixtures/app-server.ts';

export class WorkspacePage {
  readonly tree: Locator;
  readonly crumb: Locator;
  readonly heading: Locator;
  readonly sections: Locator;
  readonly compactToggle: Locator;
  readonly remaining: Locator;
  readonly progress: Locator;
  readonly sidebar: Locator;
  readonly sidebarResizer: Locator;
  readonly backToAllFiles: Locator;

  constructor(
    readonly page: Page,
    private readonly app: RunningApp,
  ) {
    this.tree = page.getByRole('navigation', { name: 'Changed files' });
    this.heading = page.getByRole('heading', { level: 1 });
    this.crumb = page.locator('main > div').first();
    this.sections = page.locator('main section');
    this.compactToggle = page.getByRole('button', { name: 'Compact' });
    this.remaining = page.getByText('Remaining').locator('..');
    this.progress = this.remaining.locator('span').filter({ hasText: /%$/ }).last();
    this.sidebar = page.locator('aside').first();
    this.sidebarResizer = page.getByRole('button', { name: /^Resize sidebar/ });
    this.backToAllFiles = page.getByRole('button', { name: 'Back to all files' });
  }

  open = async (): Promise<void> => {
    await this.page.goto(this.app.startUrl);
    await this.heading.waitFor();
  };

  /** A file row in the tree, by its displayed name. */
  fileRow = (name: string): Locator =>
    this.tree
      .getByRole('button')
      .filter({ has: this.page.getByText(name, { exact: true }) })
      .and(this.tree.locator('button:not([aria-expanded])'));

  /** A folder row in the tree, by its displayed (possibly merged) name. */
  folderRow = (name: string): Locator =>
    this.tree.getByRole('button', { name, exact: true }).and(this.tree.locator('[aria-expanded]'));

  section = (path: string): Locator => this.page.getByRole('region', { name: path });

  foldToggle = (path: string): Locator =>
    this.page.getByRole('button', { name: new RegExp(`^(Fold|Unfold) ${escapeRegExp(path)}$`) });

  reviewedCheckbox = (path: string): Locator =>
    this.page.getByRole('checkbox', { name: `Mark ${path} reviewed` });

  /** The sidebar's width setting, which excludes its border. */
  sidebarWidth = async (): Promise<number> =>
    this.sidebar.evaluate((element) => element.clientWidth);
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
