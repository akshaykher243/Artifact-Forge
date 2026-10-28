import { describe, expect, it } from 'vitest';

import {
  classifyNetworkFailure,
  SSH_AUTH_FAILED_MESSAGE,
} from '../../../../src/server/git/pr-fetch.ts';

describe('classifyNetworkFailure', () => {
  it.each([
    'git@github.com: Permission denied (publickey).\nfatal: Could not read from remote repository.',
    'Host key verification failed.\nfatal: Could not read from remote repository.',
  ])('SSH authentication fails: %s', (stderr) => {
    expect(classifyNetworkFailure(stderr)).toMatchObject({
      code: 'ssh_auth_failed',
      message: SSH_AUTH_FAILED_MESSAGE,
    });
  });

  it.each([
    'ssh: connect to host 127.0.0.1 port 1: Connection refused',
    'ssh: Could not resolve hostname github.invalid: nodename nor servname provided',
  ])('reports an unreachable remote: %s', (stderr) => {
    expect(classifyNetworkFailure(stderr).message).toMatch(/^Could not reach the remote over SSH/);
  });

  it('passes other Git errors through, masked', () => {
    const token = `ghp_${'x'.repeat(40)}`;

    expect(classifyNetworkFailure(`fatal: something odd ${token}`).message).toBe(
      'fatal: something odd [masked]',
    );
  });
});
