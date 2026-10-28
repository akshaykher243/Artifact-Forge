import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import type { Locator, Page } from '@playwright/test';

import { ARTIFACT_PATH } from '../../fixtures/artifact.ts';

const FONT_DIR = join(
  import.meta.dirname,
  '..',
  '..',
  '..',
  'node_modules',
  '@fontsource',
  'ibm-plex-mono',
  'files',
);
const WEIGHTS = [400, 500, 600] as const;
const LOCAL_FONT_HOST = 'https://fonts.gstatic.com/artifactforge-local';

/** @font-face rules for the weights the artifact asks Google Fonts for, served from local files. */
const fontCss = WEIGHTS.map(
  (weight) =>
    `@font-face{font-family:'IBM Plex Mono';font-style:normal;font-weight:${weight};` +
    `src:url(${LOCAL_FONT_HOST}/${weight}.woff2) format('woff2')}`,
).join('');

/** The original exported artifact, opened from docs/ with its web fonts served locally. */
export class ArtifactPage {
  constructor(readonly page: Page) {}

  open = async (): Promise<void> => {
    await this.page.route('https://fonts.googleapis.com/**', (route) =>
      route.fulfill({ contentType: 'text/css', body: fontCss }),
    );
    await this.page.route(`${LOCAL_FONT_HOST}/*`, (route) => {
      const weight = /(\d+)\.woff2$/.exec(route.request().url())?.[1] ?? '400';
      const file = join(FONT_DIR, `ibm-plex-mono-latin-${weight}-normal.woff2`);
      return route.fulfill({ contentType: 'font/woff2', body: readFileSync(file) });
    });
    await this.page.goto(pathToFileURL(ARTIFACT_PATH).href);
    await this.page.getByText('Files, 11').waitFor();
  };

  selectFile = async (name: string): Promise<void> => {
    await this.page
      .getByRole('button')
      .filter({ has: this.page.getByText(name, { exact: true }) })
      .last()
      .click();
    await this.page.getByText('Changed file').waitFor();
  };

  firstSection = (): Locator => this.page.locator('section').first();

  openMap = async (): Promise<void> => {
    await this.page.getByRole('button', { name: 'Map', exact: true }).click();
    await this.page.getByRole('button', { name: 'Diff overlay' }).waitFor();
  };

  /** The map's scrolling canvas, the one element drawn with the dotted background. */
  mapCanvas = (): Locator => this.page.locator('div[style*="radial-gradient"]');
}
