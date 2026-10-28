import { maskSecrets } from '../security/mask-secrets.ts';
import type { ProcessResult, RunProcess } from '../security/run-process.ts';

export const LOCAL_GIT_TIMEOUT_MS = 30_000;
export const NETWORK_GIT_TIMEOUT_MS = 120_000;

/** Disables repository hooks and fsmonitor for every command; diff commands add their own flags. */
const HARDENING = ['-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false'] as const;

export class GitError extends Error {
  constructor(
    readonly exitCode: number,
    readonly stderr: string,
  ) {
    super(stderr || `git exited with code ${exitCode}`);
    this.name = 'GitError';
  }
}

export interface GitClient {
  /** Runs git in `repo` and returns stdout; throws GitError on a non-zero exit. */
  run: (repo: string, args: readonly string[], timeoutMs?: number) => Promise<string>;
  /** Runs git in `repo` and returns the result whatever the exit code. */
  exec: (repo: string, args: readonly string[], timeoutMs?: number) => Promise<ProcessResult>;
  /** Runs git in `repo` with `input` on standard input; throws GitError on a non-zero exit. */
  feed: (repo: string, args: readonly string[], input: string) => Promise<ProcessResult>;
}

export const createGitClient = (runProcess: RunProcess, gitBinary: string): GitClient => {
  const exec: GitClient['exec'] = (repo, args, timeoutMs = LOCAL_GIT_TIMEOUT_MS) =>
    runProcess(gitBinary, ['-C', repo, ...HARDENING, ...args], { cwd: repo, timeoutMs });

  return {
    exec,
    feed: async (repo, args, input) => {
      const result = await runProcess(gitBinary, ['-C', repo, ...HARDENING, ...args], {
        cwd: repo,
        timeoutMs: LOCAL_GIT_TIMEOUT_MS,
        input,
      });
      if (result.exitCode !== 0) {
        throw new GitError(result.exitCode, maskSecrets(result.stderr));
      }
      return result;
    },
    run: async (repo, args, timeoutMs) => {
      const result = await exec(repo, args, timeoutMs);
      if (result.exitCode !== 0) {
        throw new GitError(result.exitCode, maskSecrets(result.stderr));
      }
      return result.stdout;
    },
  };
};
