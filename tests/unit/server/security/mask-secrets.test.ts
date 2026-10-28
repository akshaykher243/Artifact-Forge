import { describe, expect, it } from 'vitest';

import { MAX_MESSAGE_LENGTH, maskSecrets } from '../../../../src/server/security/mask-secrets.ts';

describe('maskSecrets', () => {
  it.each([
    `gho_${'a'.repeat(36)}`,
    `ghp_${'B1'.repeat(20)}`,
    `ghs_${'x'.repeat(40)}`,
    `github_pat_${'Z9_'.repeat(10)}`,
  ])('Token in error output: masks %s', (token) => {
    const message = maskSecrets(`HTTP 401: Bad credentials (token ${token}) for /repos/a/b`);

    expect(message).toBe('HTTP 401: Bad credentials (token [masked]) for /repos/a/b');
  });

  it('leaves ordinary text alone', () => {
    expect(maskSecrets('  fatal: not a git repository  ')).toBe('fatal: not a git repository');
  });

  it('trims long output to the message limit', () => {
    const masked = maskSecrets('x'.repeat(MAX_MESSAGE_LENGTH + 100));

    expect(masked).toHaveLength(MAX_MESSAGE_LENGTH + 1);
    expect(masked.endsWith('…')).toBe(true);
  });
});
