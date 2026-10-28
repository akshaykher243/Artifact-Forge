import { expect, test } from './test.ts';

test.describe('session start-up', () => {
  test('moves the token out of the address bar and connects', async ({ appPage, page, app }) => {
    await appPage.openWithStartUrl();

    await expect(appPage.heading).toHaveText('Open a repository');
    expect(page.url()).toBe(`${app.origin}/`);
  });

  test('stays connected after a reload in the same tab', async ({ appPage, page }) => {
    await appPage.openWithStartUrl();
    await expect(appPage.heading).toHaveText('Open a repository');

    await page.reload();

    await expect(appPage.heading).toHaveText('Open a repository');
  });

  test('explains how to connect when opened without the start-up address', async ({ appPage }) => {
    await appPage.openWithoutToken();

    await expect(appPage.status).toHaveText(
      'This page has no session. Open the address ArtifactForge printed when it started.',
    );
  });
});

test.describe('Nothing sent to AI services', () => {
  test('Network audit: the page only talks to the local service', async ({
    appPage,
    app,
    requestedUrls,
  }) => {
    await appPage.openWithStartUrl();
    await expect(appPage.heading).toHaveText('Open a repository');

    const offOrigin = requestedUrls.filter((url) => new URL(url).origin !== app.origin);
    expect(offOrigin).toEqual([]);
  });
});
