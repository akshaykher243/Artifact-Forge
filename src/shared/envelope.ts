export const ErrorCode = {
  forbidden: 'forbidden',
  notFound: 'not_found',
  invalidInput: 'invalid_input',
  unsupportedMediaType: 'unsupported_media_type',
  internal: 'internal',
  pathNotFound: 'path_not_found',
  outsideRoots: 'outside_roots',
  notARepository: 'not_a_repository',
  gitFailed: 'git_failed',
  timeout: 'timeout',
  unknownRef: 'unknown_ref',
  ambiguousRef: 'ambiguous_ref',
  noCommonHistory: 'no_common_history',
  comparisonExpired: 'comparison_expired',
  remoteNotFound: 'remote_not_found',
  remoteNotSsh: 'remote_not_ssh',
  sshAuthFailed: 'ssh_auth_failed',
  prNotFound: 'pr_not_found',
  ghUnavailable: 'gh_unavailable',
  ghFailed: 'gh_failed',
  prMoved: 'pr_moved',
  reviewChanged: 'review_changed',
  busy: 'busy',
  nothingToSend: 'nothing_to_send',
  outcomeUnknown: 'outcome_unknown',
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

export interface ErrorBody {
  code: ErrorCode;
  message: string;
}

export type Envelope<T> = { success: true; data: T } | { success: false; error: ErrorBody };
