import { z } from 'zod';

import type { JsonStore } from './json-store.ts';

const marksSchema = z.array(z.string());

export interface ReviewMarks {
  list: (comparisonId: string) => Promise<string[]>;
  set: (comparisonId: string, path: string, reviewed: boolean) => Promise<string[]>;
}

/** Comparison ids are `git:<hex>` or `fixture:<name>`; the colon becomes a dash in the file name. */
const fileFor = (comparisonId: string): string => {
  if (!/^(git|fixture):[a-z0-9]+$/.test(comparisonId)) {
    throw new Error(`Unexpected comparison id: ${comparisonId}`);
  }
  return `marks/${comparisonId.replace(':', '-')}.json`;
};

/** Reviewed files per comparison. The id is derived from repository, merge base and head. */
export const createReviewMarks = (store: JsonStore): ReviewMarks => ({
  list: async (comparisonId) => store.read(fileFor(comparisonId), marksSchema, []),
  set: async (comparisonId, path, reviewed) =>
    store.update(fileFor(comparisonId), marksSchema, [], (paths) => {
      const others = paths.filter((existing) => existing !== path);
      return reviewed ? [...others, path].sort() : others;
    }),
});
