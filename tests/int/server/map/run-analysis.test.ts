import { describe, expect, it } from 'vitest';

import { AnalysisFailure, runAnalysis } from '../../../../src/server/map/run-analysis.ts';

const INPUT = {
  files: [
    ['src/a.ts', 'export const b = () => 1;\nexport function a() { return b(); }\n'],
  ] as Array<[string, string]>,
  tsconfig: null,
  changed: [
    {
      path: 'src/a.ts',
      baseText: 'export const b = () => 1;\nexport function a() { return 0; }\n',
      rows: [
        [' ', 1, 1, 'export const b = () => 1;'],
        ['-', 2, null, 'export function a() { return 0; }'],
        ['+', null, 2, 'export function a() { return b(); }'],
      ] as Array<[' ' | '+' | '-' | '~', number | null, number | null, string]>,
    },
  ],
};

describe('runAnalysis', () => {
  it('analyses in a worker thread', async () => {
    const result = await runAnalysis(INPUT);

    expect(result.functions.map((fn) => [fn.id, fn.change, fn.depth])).toEqual([
      ['src/a.ts#b', null, 2],
      ['src/a.ts#a', 'body', 1],
    ]);
    expect(result.edges).toEqual([{ from: 'src/a.ts#a', to: 'src/a.ts#b' }]);
  });

  it('keeps the main thread free while it runs', async () => {
    let ticks = 0;
    const timer = setInterval(() => {
      ticks += 1;
    }, 5);

    await runAnalysis(INPUT);
    clearInterval(timer);

    expect(ticks).toBeGreaterThan(1);
  });

  it('stops a slow analysis at the time limit', async () => {
    await expect(runAnalysis(INPUT, 1)).rejects.toBeInstanceOf(AnalysisFailure);
  });
});
