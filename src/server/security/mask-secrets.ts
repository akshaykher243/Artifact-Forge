const SECRET_PATTERNS = [/\bgh[pousr]_[A-Za-z0-9]{36,}\b/g, /\bgithub_pat_\w{22,}\b/g];
const MASK = '[masked]';
export const MAX_MESSAGE_LENGTH = 2048;

/** Masks GitHub-token-shaped strings and trims the text before it reaches the UI or logs. */
export const maskSecrets = (text: string): string => {
  const masked = SECRET_PATTERNS.reduce((result, pattern) => result.replace(pattern, MASK), text);
  const trimmed = masked.trim();
  return trimmed.length > MAX_MESSAGE_LENGTH ? `${trimmed.slice(0, MAX_MESSAGE_LENGTH)}…` : trimmed;
};
