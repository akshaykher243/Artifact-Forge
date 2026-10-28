import { ErrorCode } from '../shared/envelope.ts';

export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

/** Raised before the server starts; its message is shown to the person running the command. */
export class StartupError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StartupError';
  }
}

export const forbidden = (): AppError => new AppError(ErrorCode.forbidden, 403, 'Forbidden');
