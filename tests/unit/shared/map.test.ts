import { describe, expect, it } from 'vitest';

import { isSourcePath } from '../../../src/shared/map.ts';

describe('isSourcePath', () => {
  it.each(['src/a.ts', 'web/App.tsx', 'lib/x.mjs', 'scripts/run.cjs', 'a.jsx', 'b.mts'])(
    'keeps %s',
    (path) => {
      expect(isSourcePath(path)).toBe(true);
    },
  );

  it.each([
    'types/global.d.ts',
    'node_modules/pkg/index.js',
    'dist/app.js',
    'apps/web/.next/server.js',
    'coverage/lcov.js',
    'README.md',
    'styles/a.css',
  ])('skips %s', (path) => {
    expect(isSourcePath(path)).toBe(false);
  });
});
