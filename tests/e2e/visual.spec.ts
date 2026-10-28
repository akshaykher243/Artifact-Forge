import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

import { expect, test } from './test.ts';

test.use({ fixture: 'small', viewport: { width: 1440, height: 1180 } });

const MAX_DIFF_PIXEL_RATIO = 0.02;

test.describe('Layout matches the artifact', () => {
  test('Visual match on the sample comparison', async ({ artifact, workspace }, testInfo) => {
    await artifact.page.setViewportSize({ width: 1440, height: 1180 });
    await artifact.open();
    await artifact.selectFile('money.ts');
    const baseline = await artifact.firstSection().screenshot({ animations: 'disabled' });
    // The baseline is always taken from the original in docs/, never hand-edited.
    const baselinePath = testInfo.snapshotPath('money-section.png');
    await mkdir(dirname(baselinePath), { recursive: true });
    await writeFile(baselinePath, baseline);

    await workspace.open();
    await workspace.fileRow('money.ts').click();
    await expect(workspace.heading).toHaveText('src/lib/money.ts');

    const actual = await workspace.sections.first().screenshot({ animations: 'disabled' });
    expect(actual).toMatchSnapshot('money-section.png', {
      maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO,
    });
  });

  test('Artifact sample: the Map at Module level', async ({
    artifact,
    workspace,
    map,
  }, testInfo) => {
    await artifact.page.setViewportSize({ width: 1440, height: 1180 });
    await artifact.open();
    await artifact.openMap();
    const baseline = await artifact.mapCanvas().screenshot({ animations: 'disabled' });
    const baselinePath = testInfo.snapshotPath('map-module.png');
    await mkdir(dirname(baselinePath), { recursive: true });
    await writeFile(baselinePath, baseline);

    await workspace.open();
    await map.open();
    await expect(map.node('formatMoney')).toBeVisible();

    const actual = await map.canvas.screenshot({ animations: 'disabled' });
    expect(actual).toMatchSnapshot('map-module.png', { maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO });
  });
});
