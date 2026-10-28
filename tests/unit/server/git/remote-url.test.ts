import { describe, expect, it } from 'vitest';

import { parseRemoteUrl } from '../../../../src/server/git/remote-url.ts';

describe('parseRemoteUrl', () => {
  it.each([
    ['git@github.com:acme/platform.git', { owner: 'acme', name: 'platform' }],
    ['git@github.com:acme/platform', { owner: 'acme', name: 'platform' }],
    ['ssh://git@github.com/acme/platform.git', { owner: 'acme', name: 'platform' }],
    ['ssh://git@github.com:22/acme/my.repo.git', { owner: 'acme', name: 'my.repo' }],
  ])('recognises the GitHub SSH remote %s', (url, github) => {
    expect(parseRemoteUrl(url)).toEqual({ github, ssh: true });
  });

  it('recognises a GitHub HTTPS remote as not SSH', () => {
    expect(parseRemoteUrl('https://github.com/acme/platform.git')).toEqual({
      github: { owner: 'acme', name: 'platform' },
      ssh: false,
    });
  });

  it.each(['git@gitlab.com:acme/platform.git', 'ssh://git@example.com/acme/platform.git'])(
    'treats %s as SSH but not GitHub',
    (url) => {
      expect(parseRemoteUrl(url)).toEqual({ github: null, ssh: true });
    },
  );

  it.each([
    '/srv/git/platform.git',
    'file:///srv/git/platform.git',
    'git@github.com:acme/../etc.git',
    'git@github.com:acme/...git',
    'ssh://git@github.com/acme/..',
    'git@github.com:acme/platform.git; rm -rf ~',
    'git@github.com:acme/plat form.git',
  ])('rejects %s as a GitHub remote', (url) => {
    expect(parseRemoteUrl(url).github).toBeNull();
  });
});
