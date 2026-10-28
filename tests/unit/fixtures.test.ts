import { describe, expect, it } from 'vitest';

import { loadArtifactModule } from '../fixtures/artifact.ts';
import large from '../fixtures/large.json' with { type: 'json' };
import small from '../fixtures/small.json' with { type: 'json' };

describe('artifact fixtures', () => {
  const artifact = loadArtifactModule();

  it('small.json is the artifact sample: 11 files, +43 −24', () => {
    const { meta, steps, diffs, files, fileDiffs } = artifact.SMALL;

    expect(small).toEqual(JSON.parse(JSON.stringify({ meta, steps, diffs, files, fileDiffs })));
    expect(small.files).toHaveLength(11);
  });

  it('large.json is the artifact generated example with matching totals', () => {
    const { meta, steps, diffs, files, fileDiffs } = artifact.buildLarge();

    expect(large).toEqual(JSON.parse(JSON.stringify({ meta, steps, diffs, files, fileDiffs })));
    const added = large.files.reduce((total, file) => total + file.a, 0);
    const removed = large.files.reduce((total, file) => total + file.r, 0);
    expect([large.files.length, added, removed]).toEqual([88, 284, 217]);
  });
});
