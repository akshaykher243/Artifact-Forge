import { spawn } from 'node:child_process';

export const MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const KILL_GRACE_MS = 2_000;

/** Fixed for every child: no prompts, no pagers, no colour, stable C locale, no update checks. */
const FIXED_ENV: Record<string, string> = {
  GIT_TERMINAL_PROMPT: '0',
  GIT_PAGER: 'cat',
  GIT_OPTIONAL_LOCKS: '0',
  LC_ALL: 'C',
  SSH_ASKPASS_REQUIRE: 'never',
  GH_PROMPT_DISABLED: '1',
  GH_NO_UPDATE_NOTIFIER: '1',
  GH_PAGER: 'cat',
  NO_COLOR: '1',
};

export interface ProcessResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  /** The raw output, for formats measured in bytes (e.g. `git cat-file --batch`). */
  stdoutBytes: Buffer;
}

export type ProcessFailureKind = 'timeout' | 'output_limit' | 'spawn_failed';

export class ProcessFailure extends Error {
  constructor(
    readonly kind: ProcessFailureKind,
    message: string,
  ) {
    super(message);
    this.name = 'ProcessFailure';
  }
}

export interface RunOptions {
  cwd: string;
  timeoutMs: number;
  /** Written to the child's stdin; otherwise stdin is closed. */
  input?: string;
}

export interface ProcessLogEntry {
  binary: string;
  command: string;
  durationMs: number;
  outcome: number | ProcessFailureKind;
}

export interface ProcessRunnerOptions {
  env: Record<string, string>;
  log: (entry: ProcessLogEntry) => void;
  maxOutputBytes?: number;
}

export type RunProcess = (
  binary: string,
  args: readonly string[],
  options: RunOptions,
) => Promise<ProcessResult>;

/** Subcommands the app runs; only these names are logged, so request data never reaches the log. */
const LOGGABLE_COMMANDS = new Set([
  'rev-parse',
  'for-each-ref',
  'remote',
  'symbolic-ref',
  'merge-base',
  'diff',
  'ls-remote',
  'fetch',
  'cat-file',
  'config',
  'pr',
  'api',
  'auth',
]);

/** The subcommand, e.g. `diff` in `git -C <repo> -c x=y diff ...`, if it is a known one. */
const commandName = (args: readonly string[]): string => {
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    if (arg === '-C' || arg === '-c') {
      i++;
    } else if (!arg.startsWith('-')) {
      return LOGGABLE_COMMANDS.has(arg) ? arg : '(other)';
    }
  }
  return '(other)';
};

/**
 * The only place that starts processes: no shell, arguments as a list, a timeout that
 * escalates to SIGKILL, capped output and a fixed environment. A non-zero exit is returned,
 * not thrown; callers decide what it means.
 */
export const createProcessRunner = ({
  env,
  log,
  maxOutputBytes = MAX_OUTPUT_BYTES,
}: ProcessRunnerOptions): RunProcess => {
  const childEnv = { ...env, ...FIXED_ENV };

  return (binary, args, { cwd, timeoutMs, input }) =>
    new Promise((resolve, reject) => {
      const started = Date.now();
      const finish = (outcome: number | ProcessFailureKind): void => {
        log({ binary, command: commandName(args), durationMs: Date.now() - started, outcome });
      };
      const child = spawn(binary, args, {
        cwd,
        env: childEnv,
        shell: false,
        stdio: [input === undefined ? 'ignore' : 'pipe', 'pipe', 'pipe'],
      });
      const stdout: Buffer[] = [];
      const stderr: Buffer[] = [];
      let size = 0;
      let failure: ProcessFailure | null = null;

      const stop = (reason: ProcessFailure): void => {
        failure ??= reason;
        child.kill('SIGTERM');
        setTimeout(() => child.kill('SIGKILL'), KILL_GRACE_MS).unref();
      };
      const collect = (sink: Buffer[]) => (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxOutputBytes) {
          stop(new ProcessFailure('output_limit', 'The command produced too much output'));
          return;
        }
        sink.push(chunk);
      };
      const timer = setTimeout(
        () =>
          stop(
            new ProcessFailure(
              'timeout',
              `The command did not finish within ${timeoutMs / 1000} s`,
            ),
          ),
        timeoutMs,
      );

      child.stdout?.on('data', collect(stdout));
      child.stderr?.on('data', collect(stderr));
      child.once('error', (error) => {
        clearTimeout(timer);
        finish('spawn_failed');
        reject(new ProcessFailure('spawn_failed', `Could not start ${binary}: ${error.message}`));
      });
      child.once('close', (code) => {
        clearTimeout(timer);
        if (failure !== null) {
          finish(failure.kind);
          reject(failure);
          return;
        }
        finish(code ?? -1);
        const bytes = Buffer.concat(stdout);
        resolve({
          exitCode: code ?? -1,
          stdout: bytes.toString('utf8'),
          stderr: Buffer.concat(stderr).toString('utf8'),
          stdoutBytes: bytes,
        });
      });
      if (input !== undefined) {
        child.stdin?.end(input);
      }
    });
};
