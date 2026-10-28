import { useEffect, useRef, useState } from 'react';

import type { DependencyMap } from '../../shared/map.ts';
import { callOperation, OperationError } from '../app/api.ts';

export type MapEntry =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'loaded'; map: DependencyMap }
  | { state: 'error'; message: string };

const IDLE: MapEntry = { state: 'idle' };

/**
 * The comparison's dependency map, requested once `wanted` first becomes true and kept for the
 * life of the comparison, so leaving and reopening the Map view does not analyse again.
 */
export const useDependencyMap = (comparisonId: string, wanted: boolean): MapEntry => {
  const [loaded, setLoaded] = useState<{ comparisonId: string; entry: MapEntry } | null>(null);
  const requested = useRef<string | null>(null);

  useEffect(() => {
    if (!wanted || requested.current === comparisonId) {
      return;
    }
    requested.current = comparisonId;
    const load = async (): Promise<void> => {
      setLoaded({ comparisonId, entry: { state: 'loading' } });
      try {
        const map = await callOperation('dependencyMap', { comparisonId });
        setLoaded({ comparisonId, entry: { state: 'loaded', map } });
      } catch (error) {
        const message = error instanceof OperationError ? error.message : 'Could not load the map.';
        setLoaded({ comparisonId, entry: { state: 'error', message } });
      }
    };
    void load();
  }, [comparisonId, wanted]);

  return loaded?.comparisonId === comparisonId ? loaded.entry : IDLE;
};
