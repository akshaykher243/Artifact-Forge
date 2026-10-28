import { createContext, useContext, useEffect, useSyncExternalStore } from 'react';

import type { FileDiff } from '../../shared/comparison.ts';
import { callOperation, OperationError } from '../app/api.ts';

export type DiffEntry =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'ready'; diff: FileDiff }
  | { state: 'failed'; message: string };

export interface DiffStore {
  get: (fileIndex: number) => DiffEntry;
  load: (fileIndex: number) => void;
  subscribe: (listener: () => void) => () => void;
}

const IDLE: DiffEntry = { state: 'idle' };

/** Caches one comparison's file diffs so re-selecting a file does not fetch it again. */
export const createDiffStore = (comparisonId: string): DiffStore => {
  const entries = new Map<number, DiffEntry>();
  const listeners = new Set<() => void>();

  const set = (fileIndex: number, entry: DiffEntry): void => {
    entries.set(fileIndex, entry);
    listeners.forEach((listener) => listener());
  };

  const fetchDiff = async (fileIndex: number): Promise<void> => {
    try {
      set(fileIndex, {
        state: 'ready',
        diff: await callOperation('fileDiff', { comparisonId, fileIndex }),
      });
    } catch (error) {
      const message = error instanceof OperationError ? error.message : 'Could not load this diff.';
      set(fileIndex, { state: 'failed', message });
    }
  };

  return {
    get: (fileIndex) => entries.get(fileIndex) ?? IDLE,
    load: (fileIndex) => {
      if (entries.has(fileIndex)) {
        return;
      }
      set(fileIndex, { state: 'loading' });
      void fetchDiff(fileIndex);
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
};

export const DiffStoreContext = createContext<DiffStore | null>(null);

/** The file's diff entry; starts loading once `wanted` is true. */
export const useFileDiff = (fileIndex: number, wanted: boolean): DiffEntry => {
  const store = useContext(DiffStoreContext);
  if (store === null) {
    throw new Error('useFileDiff must be used inside a DiffStoreContext provider');
  }
  const entry = useSyncExternalStore(store.subscribe, () => store.get(fileIndex));
  useEffect(() => {
    if (wanted) {
      store.load(fileIndex);
    }
  }, [store, fileIndex, wanted]);
  return entry;
};
