import { Worker } from 'node:worker_threads';

import type { AnalysisInput, AnalysisResult } from './analyze.ts';

export const ANALYSIS_TIMEOUT_MS = 60_000;

export class AnalysisFailure extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AnalysisFailure';
  }
}

type WorkerReply = { ok: true; result: AnalysisResult } | { ok: false; message: string };

/**
 * Analyses in a worker thread so the service keeps answering other requests meanwhile. The
 * worker runs the same TypeScript sources (registered through tsx in `analyzer-worker.mjs`) and is
 * stopped after `timeoutMs`.
 */
export const runAnalysis = (
  input: AnalysisInput,
  timeoutMs: number = ANALYSIS_TIMEOUT_MS,
): Promise<AnalysisResult> =>
  new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./analyzer-worker.mjs', import.meta.url));
    const finish = (settle: () => void): void => {
      clearTimeout(timer);
      void worker.terminate();
      settle();
    };
    const timer = setTimeout(
      () =>
        finish(() =>
          reject(new AnalysisFailure(`The analysis took longer than ${timeoutMs / 1000} s`)),
        ),
      timeoutMs,
    );
    worker.once('message', (reply: WorkerReply) =>
      finish(() => (reply.ok ? resolve(reply.result) : reject(new AnalysisFailure(reply.message)))),
    );
    worker.once('error', (error: Error) =>
      finish(() => reject(new AnalysisFailure(error.message))),
    );
    worker.postMessage(input);
  });
