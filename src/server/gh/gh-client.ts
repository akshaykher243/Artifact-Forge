import { ErrorCode } from '../../shared/envelope.ts';
import { AppError } from '../errors.ts';
import { maskSecrets } from '../security/mask-secrets.ts';
import type { ProcessResult, RunProcess } from '../security/run-process.ts';

export const GH_TIMEOUT_MS = 60_000;
export const GITHUB_HOST = 'github.com';

export class GhError extends Error {
  constructor(
    readonly exitCode: number,
    readonly stderr: string,
  ) {
    super(stderr || `gh exited with code ${exitCode}`);
    this.name = 'GhError';
  }
}

export interface GhClient {
  installed: boolean;
  /** Runs gh and returns the raw result whatever the exit code. */
  exec: (args: readonly string[], input?: string) => Promise<ProcessResult>;
  /** Runs gh and returns stdout; throws GhError (masked) on a non-zero exit. */
  run: (args: readonly string[], input?: string) => Promise<string>;
}

/**
 * The GitHub CLI, always run from the app's data folder so it never infers a repository from
 * the working directory; every command names its repository explicitly.
 */
export const createGhClient = (
  runProcess: RunProcess,
  ghBinary: string | null,
  workingDir: string,
): GhClient => {
  const exec: GhClient['exec'] = (args, input) => {
    if (ghBinary === null) {
      throw new AppError(
        ErrorCode.ghUnavailable,
        503,
        'The GitHub CLI (gh) is required to read pull requests and post reviews.',
      );
    }
    return runProcess(ghBinary, args, {
      cwd: workingDir,
      timeoutMs: GH_TIMEOUT_MS,
      ...(input === undefined ? {} : { input }),
    });
  };
  return {
    installed: ghBinary !== null,
    exec,
    run: async (args, input) => {
      const result = await exec(args, input);
      if (result.exitCode !== 0) {
        throw new GhError(result.exitCode, maskSecrets(result.stderr));
      }
      return result.stdout;
    },
  };
};
