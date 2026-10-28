import { parentPort } from 'node:worker_threads';

import { analyze } from './analyze.ts';
import type { AnalysisInput } from './analyze.ts';

/** Runs one analysis off the main thread; the TypeScript compiler is synchronous and slow. */
parentPort?.once('message', (input: AnalysisInput) => {
  try {
    parentPort?.postMessage({ ok: true, result: analyze(input) });
  } catch (error) {
    parentPort?.postMessage({
      ok: false,
      message: error instanceof Error ? error.message : String(error),
    });
  }
});
