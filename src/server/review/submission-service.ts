import { randomUUID } from 'node:crypto';

import { ErrorCode } from '../../shared/envelope.ts';
import type { PrRef, PullRequest } from '../../shared/pull-request.ts';
import { DraftState, SubmissionState } from '../../shared/review.ts';
import type { ReviewState, Submission } from '../../shared/review.ts';
import type { SubmissionResult, SubmissionSummary } from '../../shared/submission.ts';
import { AppError } from '../errors.ts';
import type { GhClient } from '../gh/gh-client.ts';
import { readGhStatus, readPullRequest } from '../gh/pull-requests.ts';
import { buildReviewRequest, listReviews, parseCreatedReview, postReview } from '../gh/reviews.ts';
import type { BuiltReview } from '../gh/reviews.ts';
import { maskSecrets } from '../security/mask-secrets.ts';
import type { ReviewDrafts } from '../store/review-drafts.ts';
import { reviewKeyOf } from './review-service.ts';
import type { ReviewService, ReviewTarget } from './review-service.ts';

/** GitHub's clock and ours can differ; a review this much older than the attempt still counts. */
const CLOCK_SKEW_MS = 2 * 60 * 1000;

const UNREADABLE_SUCCESS =
  'gh finished but its output could not be read, so the outcome is unknown. Check GitHub before trying again.';
const NO_MATCH = 'No matching review was found on GitHub. You can try again.';

export interface PrTarget extends ReviewTarget {
  pr: PrRef;
}

export interface SubmissionService {
  prepare: (target: PrTarget) => Promise<SubmissionSummary>;
  submit: (target: PrTarget, prepId: string) => Promise<SubmissionResult>;
  check: (target: PrTarget, attemptId: string) => Promise<SubmissionResult>;
  /** Marks an attempt left `submitting` by a restart as unknown; never one still running. */
  settleInterrupted: (target: ReviewTarget) => Promise<void>;
}

export interface SubmissionDependencies {
  gh: GhClient;
  reviews: ReviewService;
  drafts: ReviewDrafts;
  now?: () => Date;
}

interface Ready {
  login: string;
  details: PullRequest;
  review: ReviewState;
  built: BuiltReview;
}

export const createSubmissionService = ({
  gh,
  reviews,
  drafts,
  now = () => new Date(),
}: SubmissionDependencies): SubmissionService => {
  const running = new Set<string>();

  const signedInLogin = async (): Promise<string> => {
    const status = await readGhStatus(gh);
    if (!status.installed) {
      throw new AppError(
        ErrorCode.ghUnavailable,
        503,
        'The GitHub CLI (gh) is required to post reviews.',
      );
    }
    if (!status.signedIn || status.login === null) {
      throw new AppError(
        ErrorCode.ghUnavailable,
        503,
        'gh is not signed in. Run gh auth login in a terminal.',
      );
    }
    return status.login;
  };

  /** Everything a submission needs, checked against GitHub as it is right now. */
  const getReady = async (target: PrTarget): Promise<Ready> => {
    const login = await signedInLogin();
    const details = await readPullRequest(gh, target.pr);
    const head = await target.source.headSha(target.comparisonId);
    if (details.headRefOid !== head) {
      throw new AppError(
        ErrorCode.prMoved,
        409,
        'The pull request has new commits. Refresh it and check your comments before posting.',
      );
    }
    const review = await reviews.load(target);
    const built = buildReviewRequest(review, head);
    if (built.request.comments.length === 0 && built.request.body === '') {
      throw new AppError(ErrorCode.nothingToSend, 400, 'There is nothing to send yet.');
    }
    return { login, details, review, built };
  };

  const updateAttempt = (
    target: ReviewTarget,
    attemptId: string,
    change: (attempt: Submission, review: ReviewState) => ReviewState,
  ): Promise<ReviewState> =>
    drafts.updateReview(reviewKeyOf(target.comparisonId, target.pr), (review) => {
      const attempt = review.submissions.find((candidate) => candidate.attemptId === attemptId);
      return attempt === undefined ? review : change(attempt, review);
    });

  const withAttempt = (
    review: ReviewState,
    attemptId: string,
    change: Partial<Submission>,
  ): ReviewState => ({
    ...review,
    submissions: review.submissions.map((attempt) =>
      attempt.attemptId === attemptId ? { ...attempt, ...change } : attempt,
    ),
  });

  /** Marks the attempt and its drafts submitted, and clears the overall comment that was sent. */
  const markSubmitted = (target: ReviewTarget, attemptId: string, reviewUrl: string) =>
    updateAttempt(target, attemptId, (attempt, review) => ({
      ...withAttempt(review, attemptId, {
        state: SubmissionState.submitted,
        reviewUrl,
        message: null,
      }),
      overall: review.overall.trim() === attempt.overall ? '' : review.overall,
      drafts: review.drafts.map((draft) =>
        attempt.draftIds.includes(draft.id)
          ? { ...draft, state: DraftState.submitted, reviewUrl }
          : draft,
      ),
    }));

  const finish = async (
    target: ReviewTarget,
    attemptId: string,
    outcome: 'failed' | 'unknown',
    message: string,
  ): Promise<SubmissionResult> => {
    const review = await updateAttempt(target, attemptId, (_attempt, current) =>
      withAttempt(current, attemptId, { state: outcome, message }),
    );
    return { outcome, attemptId, reviewUrl: null, message, review };
  };

  const send = async (target: PrTarget, ready: Ready): Promise<SubmissionResult> => {
    const attempt: Submission = {
      attemptId: randomUUID(),
      startedAt: now().toISOString(),
      state: SubmissionState.submitting,
      bodyHash: ready.built.hash,
      overall: ready.built.request.body,
      draftIds: ready.built.draftIds,
      reviewUrl: null,
      message: null,
      checkedAt: null,
    };
    // Recorded before gh runs, so an interrupted attempt is found later and never repeated blindly.
    await drafts.updateReview(reviewKeyOf(target.comparisonId, target.pr), (review) => ({
      ...review,
      submissions: [...review.submissions, attempt],
    }));
    let result;
    try {
      result = await postReview(gh, target.pr, ready.built.request);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'gh stopped unexpectedly';
      return finish(
        target,
        attempt.attemptId,
        'unknown',
        `${reason}. The outcome is unknown; check GitHub before trying again.`,
      );
    }
    if (result.exitCode !== 0) {
      return finish(
        target,
        attempt.attemptId,
        'failed',
        maskSecrets(result.stderr) || 'gh could not post the review.',
      );
    }
    const created = parseCreatedReview(result.stdout);
    if (created === null) {
      return finish(target, attempt.attemptId, 'unknown', UNREADABLE_SUCCESS);
    }
    const review = await markSubmitted(target, attempt.attemptId, created.url);
    return {
      outcome: 'submitted',
      attemptId: attempt.attemptId,
      reviewUrl: created.url,
      message: null,
      review,
    };
  };

  const refuseUncheckedUnknown = (review: ReviewState): void => {
    const unchecked = review.submissions.find(
      (attempt) => attempt.state === SubmissionState.unknown && attempt.checkedAt === null,
    );
    if (unchecked !== undefined) {
      throw new AppError(
        ErrorCode.outcomeUnknown,
        409,
        'An earlier attempt may have posted this review. Check GitHub for it before trying again.',
      );
    }
  };

  return {
    prepare: async (target) => {
      const { login, details, built } = await getReady(target);
      return {
        ...target.pr,
        prepId: built.hash,
        title: details.title,
        state: details.state,
        baseRefName: details.baseRefName,
        headRefName: details.headRefName,
        headSha: details.headRefOid,
        action: 'Comment',
        login,
        inlineCount: built.request.comments.length,
        hasOverall: built.request.body !== '',
        outdatedCount: built.outdatedCount,
      };
    },
    submit: async (target, prepId) => {
      const key = reviewKeyOf(target.comparisonId, target.pr);
      if (running.has(key)) {
        throw new AppError(ErrorCode.busy, 409, 'This review is already being posted.');
      }
      running.add(key);
      try {
        const ready = await getReady(target);
        refuseUncheckedUnknown(ready.review);
        if (ready.built.hash !== prepId) {
          throw new AppError(ErrorCode.reviewChanged, 409, 'Review changed, confirm again.');
        }
        return await send(target, ready);
      } finally {
        running.delete(key);
      }
    },
    check: async (target, attemptId) => {
      const login = await signedInLogin();
      const review = await drafts.load(reviewKeyOf(target.comparisonId, target.pr));
      const attempt = review.submissions.find((candidate) => candidate.attemptId === attemptId);
      if (attempt === undefined || attempt.state !== SubmissionState.unknown) {
        throw new AppError(
          ErrorCode.notFound,
          404,
          'There is no attempt with an unknown outcome to check.',
        );
      }
      const since = Date.parse(attempt.startedAt) - CLOCK_SKEW_MS;
      const mine = (await listReviews(gh, target.pr)).filter(
        (posted) =>
          posted.login === login &&
          posted.submittedAt !== null &&
          Date.parse(posted.submittedAt) >= since,
      );
      const matches =
        attempt.overall === ''
          ? mine
          : mine.filter((posted) => posted.body.trim() === attempt.overall);
      if (matches.length === 1 || (attempt.overall !== '' && matches.length > 0)) {
        const { url } = await readPullRequest(gh, target.pr);
        const updated = await markSubmitted(target, attemptId, url);
        return { outcome: 'submitted', attemptId, reviewUrl: url, message: null, review: updated };
      }
      const updated = await updateAttempt(target, attemptId, (_attempt, current) =>
        withAttempt(current, attemptId, { checkedAt: now().toISOString(), message: NO_MATCH }),
      );
      return { outcome: 'unknown', attemptId, reviewUrl: null, message: NO_MATCH, review: updated };
    },
    settleInterrupted: async (target) => {
      const key = reviewKeyOf(target.comparisonId, target.pr);
      if (running.has(key)) {
        return;
      }
      // Loading a review must not write it; only an interrupted post needs settling.
      const stored = await drafts.load(key);
      if (!stored.submissions.some((attempt) => attempt.state === SubmissionState.submitting)) {
        return;
      }
      await drafts.updateReview(key, (review) =>
        review.submissions.some((attempt) => attempt.state === SubmissionState.submitting)
          ? {
              ...review,
              submissions: review.submissions.map((attempt) =>
                attempt.state === SubmissionState.submitting
                  ? {
                      ...attempt,
                      state: SubmissionState.unknown,
                      message:
                        'The app stopped while posting, so the outcome is unknown. Check GitHub before trying again.',
                    }
                  : attempt,
              ),
            }
          : review,
      );
    },
  };
};
