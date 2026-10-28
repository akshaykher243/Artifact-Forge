import { mkdir } from 'node:fs/promises';

import type { Logger } from 'pino';

import type { AppConfig } from './config.ts';
import { readFixtureMap } from './fixtures/fixture-map.ts';
import { createFixtureSource } from './fixtures/fixture-source.ts';
import { createGhClient } from './gh/gh-client.ts';
import { createGitClient } from './git/git-client.ts';
import { createGitComparisons } from './git/git-comparisons.ts';
import { createMapService } from './map/map-service.ts';
import type { HandlerDependencies } from './routes/handlers.ts';
import { createProcessRunner } from './security/run-process.ts';
import { createJsonStore } from './store/json-store.ts';
import { createRecentRepositories } from './store/recent-repositories.ts';
import { createReviewDrafts } from './store/review-drafts.ts';
import { createReviewMarks } from './store/review-marks.ts';

/** Builds everything the operation handlers need from the start-up configuration. */
export const createDependencies = async (
  config: AppConfig,
  logger: Logger,
): Promise<HandlerDependencies> => {
  const runProcess = createProcessRunner({
    env: config.childEnv,
    log: (entry) => logger.info(entry, 'process finished'),
  });
  const store = createJsonStore({
    dir: config.dataDir,
    onCorrupt: (file) => logger.warn(file, 'Corrupt data file moved aside'),
  });
  // gh runs from the data folder, so it has to exist before the first call.
  await mkdir(config.dataDir, { recursive: true, mode: 0o700 });
  const git = createGitClient(runProcess, config.binaries.git);
  const gitComparisons = createGitComparisons(git);
  return {
    fixture: config.fixture,
    fixtureSource: config.fixture === null ? null : await createFixtureSource(config.fixture),
    gitComparisons,
    pathRules: { roots: config.roots, homeDir: config.homeDir },
    git,
    gh: createGhClient(runProcess, config.binaries.gh, config.dataDir),
    recents: createRecentRepositories(store),
    marks: createReviewMarks(store),
    drafts: createReviewDrafts(store),
    maps: createMapService({
      git,
      gitComparisons,
      fixtureMap: config.fixture === null ? null : await readFixtureMap(config.fixture),
    }),
  };
};
