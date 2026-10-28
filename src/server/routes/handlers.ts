import { ErrorCode } from '../../shared/envelope.ts';
import type { ComparisonSource } from '../comparison-source.ts';
import { AppError } from '../errors.ts';
import type { FixtureName } from '../fixtures/fixture-source.ts';
import type { GhClient } from '../gh/gh-client.ts';
import { readGhStatus, readPullRequest } from '../gh/pull-requests.ts';
import type { GitClient } from '../git/git-client.ts';
import { fetchPullRequest } from '../git/pr-fetch.ts';
import { findClones } from '../git/clone-finder.ts';
import type { GitComparisons } from '../git/git-comparisons.ts';
import { listRefs, listRemotes, openRepository } from '../git/repository.ts';
import type { PathRules } from '../security/validate.ts';
import type { RecentRepositories } from '../store/recent-repositories.ts';
import type { ReviewMarks } from '../store/review-marks.ts';
import { createReviewService } from '../review/review-service.ts';
import { createSubmissionService } from '../review/submission-service.ts';
import type { FileSource, ReviewTarget } from '../review/review-service.ts';
import type { ReviewDrafts } from '../store/review-drafts.ts';
import type { MapService } from '../map/map-service.ts';
import type { OperationHandlers } from './operations.ts';

export interface HandlerDependencies {
  fixture: FixtureName | null;
  fixtureSource: ComparisonSource | null;
  gitComparisons: GitComparisons;
  pathRules: PathRules;
  git: GitClient;
  gh: GhClient;
  recents: RecentRepositories;
  marks: ReviewMarks;
  drafts: ReviewDrafts;
  maps: MapService;
}

const FIXTURE_ID_PREFIX = 'fixture:';

const requireFixture = (source: ComparisonSource | null): ComparisonSource => {
  if (source === null) {
    throw new AppError(ErrorCode.notFound, 404, 'The app is not serving sample data');
  }
  return source;
};

export const createHandlers = ({
  fixture,
  fixtureSource,
  gitComparisons,
  pathRules,
  git,
  gh,
  recents,
  marks,
  drafts,
  maps,
}: HandlerDependencies): OperationHandlers => {
  /** The GitHub owner and repository behind a remote, from its configured URL. */
  const githubRepoOf = async (repoPath: string, remoteName: string) => {
    const remote = (await listRemotes(git, repoPath)).find(
      (candidate) => candidate.name === remoteName,
    );
    if (remote === undefined) {
      throw new AppError(ErrorCode.remoteNotFound, 404, `No remote named ${remoteName}`);
    }
    if (remote.github === null) {
      throw new AppError(ErrorCode.remoteNotFound, 400, `${remoteName} is not a GitHub remote`);
    }
    return remote.github;
  };

  const sourceFor = (comparisonId: string): FileSource =>
    comparisonId.startsWith(FIXTURE_ID_PREFIX) ? requireFixture(fixtureSource) : gitComparisons;
  const reviews = createReviewService(drafts);
  const submissions = createSubmissionService({ gh, reviews, drafts });
  const targetOf = (input: { comparisonId: string; pr: ReviewTarget['pr'] }): ReviewTarget => ({
    comparisonId: input.comparisonId,
    pr: input.pr,
    source: sourceFor(input.comparisonId),
  });

  return {
    ping: async () => ({ pong: true }),
    appInfo: async () => ({ fixture, roots: [...pathRules.roots] }),
    openRepo: async ({ path }) => {
      const repository = await openRepository(git, path, pathRules);
      await recents.remember(repository);
      return repository;
    },
    recentRepos: async () => ({ repos: await recents.list() }),
    listRefs: async ({ repo }) => {
      const { path } = await openRepository(git, repo, pathRules);
      return listRefs(git, path);
    },
    findClones: async ({ owner, name }) => {
      const recent = (await recents.list()).map((repository) => repository.path);
      return { clones: await findClones(git, { owner, name }, pathRules, recent) };
    },
    ghStatus: async () => readGhStatus(gh),
    readPr: async ({ repo, remote, number }) => {
      const { path } = await openRepository(git, repo, pathRules);
      const github = await githubRepoOf(path, remote);
      return readPullRequest(gh, { owner: github.owner, name: github.name, number });
    },
    fetchPr: async ({ repo, remote, number, baseBranch }) => {
      const { path } = await openRepository(git, repo, pathRules);
      return fetchPullRequest(git, { repoPath: path, remote, number, baseBranch });
    },
    compare: async (input) => {
      if (input.source === 'fixture') {
        return requireFixture(fixtureSource).compare();
      }
      const { path } = await openRepository(git, input.repo, pathRules);
      return gitComparisons.compare({
        repoPath: path,
        base: input.base,
        head: input.head,
        baseLabel: input.baseLabel ?? null,
        headLabel: input.headLabel ?? null,
      });
    },
    fileDiff: async ({ comparisonId, fileIndex }) =>
      sourceFor(comparisonId).fileDiff(comparisonId, fileIndex),
    loadReview: async (input) => {
      const target = targetOf(input);
      await submissions.settleInterrupted(target);
      return reviews.load(target);
    },
    prepareSubmission: async (input) => submissions.prepare({ ...targetOf(input), pr: input.pr }),
    submitReview: async (input) =>
      submissions.submit({ ...targetOf(input), pr: input.pr }, input.prepId),
    checkReviews: async (input) =>
      submissions.check({ ...targetOf(input), pr: input.pr }, input.attemptId),
    saveDraft: async (input) => reviews.saveDraft(targetOf(input), input.draft),
    deleteDraft: async (input) => reviews.deleteDraft(targetOf(input), input.draftId),
    saveOverall: async (input) => reviews.saveOverall(targetOf(input), input.body),
    dependencyMap: async ({ comparisonId }) => maps.dependencyMap(comparisonId),
    reviewMarks: async ({ comparisonId }) => ({ paths: await marks.list(comparisonId) }),
    setReviewed: async ({ comparisonId, fileIndex, reviewed }) => {
      const file = await sourceFor(comparisonId).changedFile(comparisonId, fileIndex);
      return { paths: await marks.set(comparisonId, file.path, reviewed) };
    },
  };
};
