import { randomBytes, timingSafeEqual } from 'node:crypto';

export const createToken = (): string => randomBytes(32).toString('base64url');

export const tokensMatch = (expected: string, given: string | undefined): boolean => {
  if (given === undefined) {
    return false;
  }
  const expectedBytes = Buffer.from(expected);
  const givenBytes = Buffer.from(given);
  return expectedBytes.length === givenBytes.length && timingSafeEqual(expectedBytes, givenBytes);
};
