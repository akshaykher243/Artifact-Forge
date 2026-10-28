import { describe, expect, it } from 'vitest';

import { languageBadge } from '../../../../src/client/diff/language-badge.ts';

describe('languageBadge', () => {
  it.each([
    ['src/lib/money.ts', 'TS'],
    ['web/app/page.tsx', 'TS'],
    ['index.js', 'TS'],
    ['App.jsx', 'TS'],
    ['docs/money.md', 'MD'],
    ['package.json', 'JSON'],
    ['pnpm-lock.yaml', 'YAML'],
    ['schema.graphql', 'GRAP'],
  ])('%s → %s', (path, badge) => {
    expect(languageBadge(path)).toBe(badge);
  });
});
