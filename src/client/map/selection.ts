import type { MapFunction } from '../../shared/map.ts';
import type { FolderFile, MapInput, MapLevel } from './layout.ts';
import { dirOf, folderFiles } from './layout.ts';

export type MapSelection =
  | { kind: 'folder'; name: string; files: FolderFile[]; additions: number; deletions: number }
  | { kind: 'file'; file: FolderFile; changed: boolean }
  | { kind: 'function'; fn: MapFunction };

/** What the selected node stands for at this level, or null when nothing on the map matches. */
export const resolveSelection = (
  input: MapInput,
  level: MapLevel,
  id: string | null,
): MapSelection | null => {
  if (id === null) {
    return null;
  }
  if (level === 'arch') {
    const files = folderFiles(input, id);
    if (files.length === 0) {
      return null;
    }
    const additions = files.reduce((total, file) => total + file.additions, 0);
    const deletions = files.reduce((total, file) => total + file.deletions, 0);
    return { kind: 'folder', name: id, files, additions, deletions };
  }
  if (level === 'package') {
    const file = folderFiles(input, dirOf(id)).find((candidate) => candidate.path === id);
    if (file === undefined) {
      return null;
    }
    return { kind: 'file', file, changed: input.files.some((changed) => changed.path === id) };
  }
  const fn = input.functions.find((candidate) => candidate.id === id);
  return fn === undefined ? null : { kind: 'function', fn };
};
