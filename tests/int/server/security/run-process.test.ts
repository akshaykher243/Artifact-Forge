import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
  createProcessRunner,
  ProcessFailure,
} from '../../../../src/server/security/run-process.ts';
import type { ProcessLogEntry } from '../../../../src/server/security/run-process.ts';

const PARENT_ENV = { PATH: '/usr/bin:/bin', HOME: tmpdir() };

const runner = (options: { maxOutputBytes?: number } = {}) => {
  const entries: ProcessLogEntry[] = [];
  const run = createProcessRunner({
    env: PARENT_ENV,
    log: (entry) => entries.push(entry),
    ...options,
  });
  return { run, entries };
};

describe('process runner', () => {
  it('returns stdout, stderr and the exit code without throwing on failure', async () => {
    const { run } = runner();

    const result = await run('/bin/sh', ['-c', 'echo out; echo err >&2; exit 3'], {
      cwd: tmpdir(),
      timeoutMs: 5_000,
    });

    expect(result).toMatchObject({ exitCode: 3, stdout: 'out\n', stderr: 'err\n' });
    expect(result.stdoutBytes.toString('utf8')).toBe('out\n');
  });

  it('passes no shell: metacharacters in arguments stay literal', async () => {
    const { run } = runner();

    const result = await run('/bin/echo', ['$(touch /tmp/af-pwned); `id` | cat'], {
      cwd: tmpdir(),
      timeoutMs: 5_000,
    });

    expect(result.stdout).toBe('$(touch /tmp/af-pwned); `id` | cat\n');
  });

  it('gives children only the allowlisted environment plus fixed values', async () => {
    const { run } = runner();

    const { stdout } = await run('/usr/bin/env', [], { cwd: tmpdir(), timeoutMs: 5_000 });
    const names = stdout
      .trim()
      .split('\n')
      .map((line) => line.slice(0, line.indexOf('=')));

    expect(names.sort()).toEqual(
      [
        'PATH',
        'HOME',
        'GIT_TERMINAL_PROMPT',
        'GIT_PAGER',
        'GIT_OPTIONAL_LOCKS',
        'LC_ALL',
        'SSH_ASKPASS_REQUIRE',
        'GH_PROMPT_DISABLED',
        'GH_NO_UPDATE_NOTIFIER',
        'GH_PAGER',
        'NO_COLOR',
      ].sort(),
    );
  });

  it('writes request data to stdin when given, and closes it otherwise', async () => {
    const { run } = runner();

    const echoed = await run('/bin/cat', [], { cwd: tmpdir(), timeoutMs: 5_000, input: 'hello' });
    const closed = await run('/bin/cat', [], { cwd: tmpdir(), timeoutMs: 5_000 });

    expect(echoed.stdout).toBe('hello');
    expect(closed.stdout).toBe('');
  });

  it('Hung process: terminates it and fails with a timeout', async () => {
    const { run, entries } = runner();

    const attempt = run('/bin/sleep', ['10'], { cwd: tmpdir(), timeoutMs: 200 });

    await expect(attempt).rejects.toThrow(
      new ProcessFailure('timeout', 'The command did not finish within 0.2 s'),
    );
    expect(entries).toEqual([expect.objectContaining({ command: '(other)', outcome: 'timeout' })]);
  });

  it('stops a process that produces too much output', async () => {
    const { run } = runner({ maxOutputBytes: 1024 });

    const attempt = run('/usr/bin/yes', [], { cwd: tmpdir(), timeoutMs: 5_000 });

    await expect(attempt).rejects.toMatchObject({ kind: 'output_limit' });
  });

  it('reports a binary that cannot start', async () => {
    const { run } = runner();

    const attempt = run('/nonexistent/af-binary', [], { cwd: tmpdir(), timeoutMs: 5_000 });

    await expect(attempt).rejects.toMatchObject({ kind: 'spawn_failed' });
  });

  it('logs the command name, duration and exit code, never the arguments', async () => {
    const { run, entries } = runner();

    await run('/bin/echo', ['secret-comment-text'], { cwd: tmpdir(), timeoutMs: 5_000 });

    expect(entries).toHaveLength(1);
    expect(JSON.stringify(entries)).not.toContain('secret-comment-text');
  });
});
