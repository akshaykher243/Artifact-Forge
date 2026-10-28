import type { Locator, Page } from '@playwright/test';

import type { RunningApp } from '../../fixtures/app-server.ts';

export class AppPage {
  readonly status: Locator;
  readonly heading: Locator;
  readonly repositoryPath: Locator;
  readonly openButton: Locator;
  readonly error: Locator;
  readonly recents: Locator;

  constructor(
    readonly page: Page,
    private readonly app: RunningApp,
  ) {
    this.status = page.getByRole('status');
    this.heading = page.getByRole('heading', { level: 1 });
    this.repositoryPath = page.getByLabel('Repository path');
    this.openButton = page.getByRole('button', { name: 'Open', exact: true });
    this.error = page.getByRole('alert');
    this.recents = page.getByRole('region', { name: 'Recent repositories' });
  }

  /** Opens the app the way a person does: with the address printed at start-up. */
  openWithStartUrl = async (): Promise<void> => {
    await this.page.goto(this.app.startUrl);
  };

  openWithoutToken = async (): Promise<void> => {
    await this.page.goto(`${this.app.origin}/`);
  };

  openRepository = async (path: string): Promise<void> => {
    await this.repositoryPath.fill(path);
    await this.openButton.click();
  };
}
