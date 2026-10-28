import { describe, expect, it } from 'vitest';

import { checkNode } from '../../../../src/server/doctor/checks.ts';
import { formatReport } from '../../../../src/server/doctor/doctor.ts';
import { githubSshState } from '../../../../src/server/git/prerequisites.ts';

const sshResult = (stderr: string) => ({
  exitCode: 1,
  stdout: '',
  stderr,
  stdoutBytes: Buffer.alloc(0),
});

describe('checkNode', () => {
  it('accepts Node.js 22 and newer, and refuses older', () => {
    expect([checkNode('22.13.1').status, checkNode('24.0.0').status]).toEqual(['ok', 'ok']);
    expect(checkNode('20.11.0')).toMatchObject({ status: 'fail', fix: expect.any(String) });
  });
});

describe('githubSshState', () => {
  it.each([
    [
      "Hi someone! You've successfully authenticated, but GitHub does not provide shell access.",
      'authenticated',
    ],
    ['Host key verification failed.', 'unknownHost'],
    ['git@github.com: Permission denied (publickey).', 'denied'],
    ['ssh: connect to host github.com port 22: Operation timed out', 'unreachable'],
  ])('reads %s as %s', (stderr, state) => {
    expect(githubSshState(sshResult(stderr))).toBe(state);
  });
});

describe('formatReport', () => {
  const okCheck = { name: 'Git', status: 'ok' as const, detail: '2.50', fix: null };

  it('says everything is ready when every check passes', () => {
    expect(formatReport([okCheck])).toContain('Everything is ready. Start with: pnpm start');
  });

  it('lists the fix under a failing check and counts the problems', () => {
    const report = formatReport([
      okCheck,
      { name: 'Built UI', status: 'fail', detail: 'not built yet', fix: 'Run: pnpm build' },
    ]);

    expect(report).toContain('  ✗ Built UI: not built yet\n      Run: pnpm build');
    expect(report).toContain('1 problem(s) stop ArtifactForge from starting');
  });

  it('is ready to start when only pull request checks warn', () => {
    const report = formatReport([
      okCheck,
      { name: 'GitHub CLI', status: 'warn', detail: 'gh not found on PATH', fix: 'Install gh' },
    ]);

    expect(report).toContain('Ready to start (pnpm start)');
  });
});
