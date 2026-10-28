import { isSourcePath, MAP_SOURCE_LIMIT } from '../../shared/map.ts';
import type { GitClient } from '../git/git-client.ts';

const MAX_FILE_BYTES = 1024 * 1024;
const BATCH_SIZE = 400;
/**
 * Parses `git cat-file --batch` output, which is measured in bytes: for each request either
 * `<sha> <type> <size>\n<content>\n` or `<request> missing\n`. Missing, non-blob or oversized
 * objects map to null.
 */
export const parseBatch = (
  output: Buffer,
  requests: readonly string[],
): Map<string, string | null> => {
  const contents = new Map<string, string | null>();
  let offset = 0;
  for (const request of requests) {
    const lineEnd = output.indexOf(0x0a, offset);
    if (lineEnd === -1) {
      contents.set(request, null);
      continue;
    }
    const header = output.subarray(offset, lineEnd).toString('utf8');
    offset = lineEnd + 1;
    const match = /^[0-9a-f]+ (\w+) (\d+)$/.exec(header);
    if (match === null) {
      contents.set(request, null);
      continue;
    }
    const size = Number(match[2]);
    const body = output.subarray(offset, offset + size);
    offset += size + 1;
    contents.set(
      request,
      match[1] === 'blob' && size <= MAX_FILE_BYTES ? body.toString('utf8') : null,
    );
  }
  return contents;
};

/** Paths of the commit's source files, without reading any content. */
export const listSourceFiles = async (
  git: GitClient,
  repo: string,
  commit: string,
): Promise<string[]> => {
  const output = await git.run(repo, ['ls-tree', '-r', '-z', '--name-only', commit]);
  return output.split('\0').filter((path) => path !== '' && isSourcePath(path));
};

/** Reads files of `commit` from Git objects, in batches; unreadable ones map to null. */
export const readFiles = async (
  git: GitClient,
  repo: string,
  commit: string,
  paths: readonly string[],
): Promise<Map<string, string | null>> => {
  const contents = new Map<string, string | null>();
  for (let start = 0; start < paths.length; start += BATCH_SIZE) {
    const batch = paths.slice(start, start + BATCH_SIZE);
    const requests = batch.map((path) => `${commit}:${path}`);
    const result = await git.feed(repo, ['cat-file', '--batch'], `${requests.join('\n')}\n`);
    const parsed = parseBatch(result.stdoutBytes, requests);
    batch.forEach((path, index) => contents.set(path, parsed.get(requests[index] ?? '') ?? null));
  }
  return contents;
};

export type Snapshot =
  | { state: 'tooLarge'; sourceFileCount: number }
  | {
      state: 'ready';
      sourceFileCount: number;
      files: Map<string, string>;
      /** The root `tsconfig.json`, if the commit has one. */
      tsconfig: string | null;
    };

/** The commit's source files and root `tsconfig.json`, if there are not too many to analyse. */
export const readSnapshot = async (
  git: GitClient,
  repo: string,
  commit: string,
): Promise<Snapshot> => {
  const paths = await listSourceFiles(git, repo, commit);
  if (paths.length > MAP_SOURCE_LIMIT) {
    return { state: 'tooLarge', sourceFileCount: paths.length };
  }
  const contents = await readFiles(git, repo, commit, [...paths, 'tsconfig.json']);
  const files = new Map<string, string>();
  for (const path of paths) {
    const text = contents.get(path);
    if (text !== null && text !== undefined) {
      files.set(path, text);
    }
  }
  return {
    state: 'ready',
    sourceFileCount: paths.length,
    files,
    tsconfig: contents.get('tsconfig.json') ?? null,
  };
};
