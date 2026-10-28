import type { ProcessResult, RunProcess } from '../security/run-process.ts';
import { GITHUB_HOST } from '../gh/gh-client.ts';

const SSH_TIMEOUT_MS = 20_000;

export type GithubSshState = 'authenticated' | 'unknownHost' | 'denied' | 'unreachable';

/** What `ssh -T git@github.com` reported; GitHub always exits 1 because it offers no shell. */
export const githubSshState = (result: ProcessResult): GithubSshState => {
  const said = result.stderr;
  if (said.includes('successfully authenticated')) {
    return 'authenticated';
  }
  if (said.includes('Host key verification failed')) {
    return 'unknownHost';
  }
  return said.includes('Permission denied') ? 'denied' : 'unreachable';
};

/**
 * Asks GitHub whether the agent's key is accepted, without prompting: no passphrase, no
 * host-key question (an unknown host is reported instead), and a short connection timeout.
 */
export const checkGithubSsh = async (
  runProcess: RunProcess,
  ssh: string,
  cwd: string,
): Promise<GithubSshState> =>
  githubSshState(
    await runProcess(
      ssh,
      ['-T', '-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', `git@${GITHUB_HOST}`],
      { cwd, timeoutMs: SSH_TIMEOUT_MS },
    ),
  );

/** `git --version`, e.g. `2.50.1`. */
export const readGitVersion = async (
  runProcess: RunProcess,
  git: string,
  cwd: string,
): Promise<string> => {
  const { stdout } = await runProcess(git, ['--version'], { cwd, timeoutMs: SSH_TIMEOUT_MS });
  return stdout.replace(/^git version\s*/, '').trim();
};
