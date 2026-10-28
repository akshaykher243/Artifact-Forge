import { z } from 'zod';

import { recentRepositorySchema } from '../../shared/repository.ts';
import type { OpenedRepository, RecentRepository } from '../../shared/repository.ts';
import type { JsonStore } from './json-store.ts';

const FILE = 'recent.json';
const MAX_RECENT = 10;
const recentListSchema = z.array(recentRepositorySchema);

export interface RecentRepositories {
  list: () => Promise<RecentRepository[]>;
  remember: (repository: OpenedRepository) => Promise<void>;
}

export const createRecentRepositories = (
  store: JsonStore,
  now: () => Date = () => new Date(),
): RecentRepositories => ({
  list: () => store.read(FILE, recentListSchema, []),
  remember: async (repository) => {
    const entry = { ...repository, openedAt: now().toISOString() };
    await store.update(FILE, recentListSchema, [], (recents) =>
      [entry, ...recents.filter((recent) => recent.path !== repository.path)].slice(0, MAX_RECENT),
    );
  },
});
