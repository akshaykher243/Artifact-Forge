import { describe, expect, it } from 'vitest';

import { createToken, tokensMatch } from '../../../../src/server/security/token.ts';

describe('session token', () => {
  it('creates a 43-character base64url token from 32 random bytes', () => {
    const token = createToken();

    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it('creates a different token each time', () => {
    expect(createToken()).not.toBe(createToken());
  });

  it('matches only the identical token', () => {
    const token = createToken();

    expect(tokensMatch(token, token)).toBe(true);
    expect(tokensMatch(token, `${token}x`)).toBe(false);
    expect(tokensMatch(token, token.slice(1))).toBe(false);
    expect(tokensMatch(token, undefined)).toBe(false);
  });
});
