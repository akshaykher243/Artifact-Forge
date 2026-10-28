import type { Envelope, ErrorCode } from '../../shared/envelope.ts';
import type { OperationInput, OperationName, OperationOutput } from '../../shared/operations.ts';
import { getSessionToken } from './token.ts';

export class OperationError extends Error {
  constructor(
    readonly code: ErrorCode | 'network' | 'no_session',
    message: string,
  ) {
    super(message);
    this.name = 'OperationError';
  }
}

const NO_SESSION_MESSAGE =
  'This page has no session. Open the address ArtifactForge printed when it started.';

export const callOperation = async <N extends OperationName>(
  name: N,
  input: OperationInput<N>,
): Promise<OperationOutput<N>> => {
  const token = getSessionToken();
  if (token === null) {
    throw new OperationError('no_session', NO_SESSION_MESSAGE);
  }
  let response: Response;
  try {
    response = await fetch(`/api/op/${name}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-af-token': token },
      body: JSON.stringify(input),
    });
  } catch {
    throw new OperationError('network', 'ArtifactForge is not reachable. Is it still running?');
  }
  const envelope = (await response.json()) as Envelope<OperationOutput<N>>;
  if (!envelope.success) {
    throw new OperationError(envelope.error.code, envelope.error.message);
  }
  return envelope.data;
};
