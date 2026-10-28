import { describe, expect, it } from 'vitest';

import { readPrLink } from '../../../src/shared/pull-request.ts';

describe('readPrLink', () => {
  it.each([
    'https://github.com/TechHoldingLLC/asur-website/pull/39',
    'https://github.com/TechHoldingLLC/asur-website/pull/39/files',
    'https://github.com/TechHoldingLLC/asur-website/pull/39/files?diff=split',
    'https://github.com/TechHoldingLLC/asur-website/pull/39#discussion_r1',
    '  http://www.github.com/TechHoldingLLC/asur-website/pull/39  ',
  ])('reads %s as pull request 39', (link) => {
    expect(readPrLink(link)).toEqual({
      kind: 'pullRequest',
      pr: { owner: 'TechHoldingLLC', name: 'asur-website', number: 39 },
    });
  });

  it.each([
    'https://github.com/TechHoldingLLC/asur-website',
    'https://github.com/TechHoldingLLC/asur-website/issues/39',
    'https://github.com/TechHoldingLLC/asur-website/pull/0',
    'https://gitlab.com/acme/platform/pull/3',
    'https://github.com.evil.example/acme/platform/pull/3',
    'https://github.com/acme/../pull/3',
  ])('Not a pull request link: %s', (link) => {
    expect(readPrLink(link)).toEqual({ kind: 'otherLink' });
  });

  it.each(['/Users/me/code/app', '~/code/app', 'relative/path'])('treats %s as a path', (path) => {
    expect(readPrLink(path)).toEqual({ kind: 'notALink' });
  });
});
