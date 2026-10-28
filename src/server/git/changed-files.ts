import { FileStatus } from '../../shared/comparison.ts';
import type { ChangedFile } from '../../shared/comparison.ts';

interface NameStatus {
  status: ChangedFile['status'];
  path: string;
  oldPath: string | null;
}

interface LineCounts {
  additions: number;
  deletions: number;
  binary: boolean;
}

const STATUS_BY_LETTER: Record<string, ChangedFile['status']> = {
  A: FileStatus.added,
  M: FileStatus.modified,
  T: FileStatus.modified,
  D: FileStatus.deleted,
  R: FileStatus.renamed,
};

/** Parses `git diff --name-status -z -M`: `M\0path\0` or `R100\0old\0new\0`. */
export const parseNameStatus = (output: string): NameStatus[] => {
  const fields = output.split('\0');
  const entries: NameStatus[] = [];
  let i = 0;
  while (i < fields.length && fields[i] !== '') {
    const code = fields[i] ?? '';
    const status = STATUS_BY_LETTER[code[0] ?? ''] ?? FileStatus.modified;
    if (status === FileStatus.renamed) {
      entries.push({ status, oldPath: fields[i + 1] ?? '', path: fields[i + 2] ?? '' });
      i += 3;
    } else {
      entries.push({ status, oldPath: null, path: fields[i + 1] ?? '' });
      i += 2;
    }
  }
  return entries;
};

/** Parses `git diff --numstat -z -M`: `a\tr\tpath\0`, or `a\tr\t\0old\0new\0` for renames. */
export const parseNumstat = (output: string): Map<string, LineCounts> => {
  const fields = output.split('\0');
  const counts = new Map<string, LineCounts>();
  let i = 0;
  while (i < fields.length && fields[i] !== '') {
    const [added = '', removed = '', inlinePath = ''] = (fields[i] ?? '').split('\t');
    const binary = added === '-' && removed === '-';
    const value = {
      additions: binary ? 0 : Number(added),
      deletions: binary ? 0 : Number(removed),
      binary,
    };
    if (inlinePath === '') {
      counts.set(fields[i + 2] ?? '', value);
      i += 3;
    } else {
      counts.set(inlinePath, value);
      i += 1;
    }
  }
  return counts;
};

export const joinChangedFiles = (nameStatus: string, numstat: string): ChangedFile[] => {
  const counts = parseNumstat(numstat);
  return parseNameStatus(nameStatus).map((entry) => ({
    ...entry,
    ...(counts.get(entry.path) ?? { additions: 0, deletions: 0, binary: false }),
  }));
};
