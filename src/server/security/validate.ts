import { realpath, stat } from 'node:fs/promises';
import { isAbsolute, join, sep } from 'node:path';

import { ErrorCode } from '../../shared/envelope.ts';
import { AppError } from '../errors.ts';

export interface PathRules {
  roots: readonly string[];
  homeDir: string;
}

const expandHome = (input: string, homeDir: string): string => {
  if (input === '~') {
    return homeDir;
  }
  return input.startsWith('~/') ? join(homeDir, input.slice(2)) : input;
};

export const isInsideRoot = (path: string, root: string): boolean =>
  path === root || path.startsWith(root.endsWith(sep) ? root : `${root}${sep}`);

const resolveExisting = async (path: string): Promise<string> => {
  try {
    return await realpath(path);
  } catch {
    throw new AppError(ErrorCode.pathNotFound, 404, `Path not found: ${path}`);
  }
};

/**
 * Resolves a typed repository path to its real location and confines it to the configured
 * roots. Symlinks are followed first, so a link inside a root cannot point outside it.
 */
export const resolveRepositoryPath = async (input: string, rules: PathRules): Promise<string> => {
  const expanded = expandHome(input.trim(), rules.homeDir);
  if (!isAbsolute(expanded)) {
    throw new AppError(
      ErrorCode.invalidInput,
      400,
      'Enter an absolute path, for example ~/code/app',
    );
  }
  const resolved = await resolveExisting(expanded);
  if (!rules.roots.some((root) => isInsideRoot(resolved, root))) {
    throw new AppError(
      ErrorCode.outsideRoots,
      403,
      `Repositories must be inside: ${rules.roots.join(', ')}`,
    );
  }
  if (!(await stat(resolved)).isDirectory()) {
    throw new AppError(ErrorCode.notARepository, 400, 'Not a Git repository');
  }
  return resolved;
};
