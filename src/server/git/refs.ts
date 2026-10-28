import { ErrorCode } from '../../shared/envelope.ts';
import { AppError } from '../errors.ts';
import type { GitClient } from './git-client.ts';

const MAX_REF_LENGTH = 255;
const HEX_SHA = /^[0-9a-f]{4,64}$/i;
// Control characters, space and the characters Git forbids in ref names, plus `..` and `@{`.
// eslint-disable-next-line no-control-regex -- rejecting control characters is the point.
const FORBIDDEN = /[\x00-\x20\x7f~^:?*[\\]|\.\.|@\{/;

/**
 * Accepts a branch, remote branch, tag or SHA as typed, and rejects anything that could be
 * read as an option or as revision syntax. Resolution (with `--end-of-options`) comes after.
 */
export const validateRef = (ref: string): string => {
  const trimmed = ref.trim();
  const valid =
    trimmed.length > 0 &&
    trimmed.length <= MAX_REF_LENGTH &&
    !trimmed.startsWith('-') &&
    (HEX_SHA.test(trimmed) || !FORBIDDEN.test(trimmed));
  if (!valid) {
    throw new AppError(ErrorCode.invalidInput, 400, `Not a valid ref: ${trimmed.slice(0, 80)}`);
  }
  return trimmed;
};

/** Resolves a validated ref to a full commit SHA. */
export const resolveCommit = async (git: GitClient, repo: string, ref: string): Promise<string> => {
  const name = validateRef(ref);
  const result = await git.exec(repo, [
    'rev-parse',
    '--verify',
    '--end-of-options',
    `${name}^{commit}`,
  ]);
  if (result.exitCode === 0) {
    return result.stdout.trim();
  }
  if (/is ambiguous/.test(result.stderr)) {
    throw new AppError(
      ErrorCode.ambiguousRef,
      400,
      `${name} matches more than one object. Enter a longer SHA.`,
    );
  }
  throw new AppError(ErrorCode.unknownRef, 404, `Unknown ref: ${name}`);
};
