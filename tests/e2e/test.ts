import { test as base, expect } from '@playwright/test';

import { startApp } from '../fixtures/app-server.ts';
import type { RunningApp, StartOptions } from '../fixtures/app-server.ts';
import { AppPage } from './pages/app-page.ts';
import { ArtifactPage } from './pages/artifact-page.ts';
import { MapPage } from './pages/map-page.ts';
import { ReviewPage } from './pages/review-page.ts';
import { WorkspacePage } from './pages/workspace-page.ts';

interface TestFixtures {
  /** Which artifact sample the app serves; set with `test.use({ fixture })`. */
  fixture: StartOptions['fixture'];
  /** A fresh app per test: its own port, root and data folder, so no state leaks between tests. */
  app: RunningApp;
  appPage: AppPage;
  workspace: WorkspacePage;
  review: ReviewPage;
  map: MapPage;
  artifact: ArtifactPage;
  /** Every URL the page requested; anything off the app's origin is also aborted. */
  requestedUrls: string[];
}

export const test = base.extend<TestFixtures>({
  fixture: [null, { option: true }],
  app: async ({ fixture }, use) => {
    const app = await startApp({ fixture });
    await use(app);
    await app.stop();
  },
  requestedUrls: async ({ context, app }, use) => {
    const urls: string[] = [];
    context.on('request', (request) => urls.push(request.url()));
    await context.route(
      (url) => url.origin !== app.origin,
      (route) => route.abort('blockedbyclient'),
    );
    await use(urls);
  },
  appPage: async ({ page, app, requestedUrls }, use) => {
    // Depends on requestedUrls so the network guard is installed before any navigation.
    void requestedUrls;
    await use(new AppPage(page, app));
  },
  workspace: async ({ page, app, requestedUrls }, use) => {
    void requestedUrls;
    await use(new WorkspacePage(page, app));
  },
  review: async ({ page, workspace }, use) => {
    await use(new ReviewPage(page, workspace));
  },
  map: async ({ page, workspace }, use) => {
    void workspace;
    await use(new MapPage(page));
  },
  // The original artifact is opened in its own context: it is a local file, not the app.
  artifact: async ({ browser }, use) => {
    const context = await browser.newContext();
    const artifactPage = new ArtifactPage(await context.newPage());
    await use(artifactPage);
    await context.close();
  },
});

export { expect };
