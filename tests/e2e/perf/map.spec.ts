import { makeRepo } from '../../fixtures/repo-builder.ts';
import { expect, test } from '../test.ts';

// Runs in the performance project, alone, after every other spec.
const FILE_COUNT = 1_000;
const PACKAGE_SIZE = 50;
const MAP_BUDGET_MS = 15_000;
// The spec only asks that it is answered; this bound is well under the analysis time but leaves
// room for this machine's slow process start-up while the analyzer worker is busy.
const FILE_DIFF_BUDGET_MS = 3_000;

const pathOf = (i: number): string => `packages/p${Math.floor(i / PACKAGE_SIZE)}/src/file-${i}.ts`;

/** Each file calls the one before it in its package, so the map has callers and callees. */
const sourceOf = (i: number, body: string): string => {
  if (i % PACKAGE_SIZE === 0) {
    return `export const fn${i} = (n: number): number => ${body};\n`;
  }
  return (
    `import { fn${i - 1} } from './file-${i - 1}';\n` +
    `export const fn${i} = (n: number): number => fn${i - 1}(${body});\n`
  );
};

test.describe('Map within budget', () => {
  test('Thousand-file repository: the map is drawn within 15 s', async ({
    appPage,
    workspace,
    map,
    app,
    page,
  }) => {
    const repo = await makeRepo(app.root);
    await repo.commit(
      'base',
      Object.fromEntries(
        Array.from({ length: FILE_COUNT }, (_, i) => [pathOf(i), sourceOf(i, 'n')]),
      ),
    );
    repo.git('switch', '--quiet', '-c', 'feature/tweak');
    const changed = Array.from(
      { length: FILE_COUNT / PACKAGE_SIZE },
      (_, p) => p * PACKAGE_SIZE + 25,
    );
    await repo.commit(
      'tweak',
      Object.fromEntries(changed.map((i) => [pathOf(i), sourceOf(i, 'n + 1')])),
    );
    await appPage.openWithStartUrl();
    await appPage.openRepository(repo.path);
    await page.getByRole('button', { name: 'Compare' }).click();
    await expect(workspace.heading).toHaveText(`${changed.length} changed files`);

    let mapAnswered = false;
    const mapRequest = page.waitForRequest('**/api/op/dependencyMap');
    void page.waitForResponse('**/api/op/dependencyMap').then(() => {
      mapAnswered = true;
    });
    const opened = Date.now();
    await map.open();
    const { comparisonId } = (await mapRequest).postDataJSON() as { comparisonId: string };

    const fileDiffMs = await page.evaluate(async (id) => {
      const token = window.sessionStorage.getItem('artifactforge.token') ?? '';
      const started = performance.now();
      const response = await fetch('/api/op/fileDiff', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-af-token': token },
        body: JSON.stringify({ comparisonId: id, fileIndex: 0 }),
      });
      await response.json();
      return performance.now() - started;
    }, comparisonId);
    const answeredDuringAnalysis = !mapAnswered;

    await expect(page.getByText(`${changed.length} changed functions`)).toBeVisible({
      timeout: MAP_BUDGET_MS,
    });
    const mapMs = Date.now() - opened;

    test.info().annotations.push({
      type: 'timing',
      description: `map ${mapMs} ms; fileDiff during analysis ${Math.round(fileDiffMs)} ms`,
    });
    expect(mapMs).toBeLessThan(MAP_BUDGET_MS);
    expect(answeredDuringAnalysis, 'fileDiff was answered before the analysis finished').toBe(true);
    expect(fileDiffMs).toBeLessThan(FILE_DIFF_BUDGET_MS);
  });
});
