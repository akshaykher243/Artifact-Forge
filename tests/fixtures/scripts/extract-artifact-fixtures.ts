/**
 * Regenerates tests/fixtures/small.json and large.json from the exported artifact in docs/.
 * Run with: pnpm exec tsx tests/fixtures/scripts/extract-artifact-fixtures.ts
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { loadArtifactModule } from '../artifact.ts';
import type { ArtifactData } from '../artifact.ts';

const FIXTURES_DIR = join(import.meta.dirname, '..');

const pick = ({ meta, steps, diffs, files, fileDiffs }: ArtifactData): ArtifactData => ({
  meta,
  steps,
  diffs,
  files,
  fileDiffs,
});

const main = async (): Promise<void> => {
  const artifact = loadArtifactModule();
  await writeFile(join(FIXTURES_DIR, 'small.json'), `${JSON.stringify(pick(artifact.SMALL))}\n`);
  await writeFile(
    join(FIXTURES_DIR, 'large.json'),
    `${JSON.stringify(pick(artifact.buildLarge()))}\n`,
  );
};

await main();
