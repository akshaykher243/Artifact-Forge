import { describe, expect, it } from 'vitest';

import { validateRef } from '../../../../src/server/git/refs.ts';

describe('validateRef', () => {
  it.each([
    'main',
    'feature/multi-currency',
    'origin/main',
    'v1.0.0',
    'release-2026_10',
    'a1b2c3d',
    'HEAD',
  ])('accepts %s', (ref) => {
    expect(validateRef(ref)).toBe(ref);
  });

  it('trims surrounding whitespace', () => {
    expect(validateRef('  main  ')).toBe('main');
  });

  it.each([
    '--output=/tmp/x',
    '-c core.pager=sh',
    '-p',
    'main..feature',
    'main...feature',
    'HEAD~1',
    'HEAD^',
    'main@{1}',
    'a:b',
    'feat*',
    'feat?',
    'feat[1]',
    'back\\slash',
    'two words',
    'tab\there',
    'nul\0byte',
    '',
    'x'.repeat(256),
  ])('Injected flag: rejects %j before any process starts', (ref) => {
    expect(() => validateRef(ref)).toThrow(/Not a valid ref/);
  });
});
