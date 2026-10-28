/** `TS` for TypeScript and JavaScript sources, otherwise the upper-cased extension, at most 4 letters. */
export const languageBadge = (path: string): string => {
  if (/\.(t|j)sx?$/.test(path)) {
    return 'TS';
  }
  return (path.split('.').pop() ?? '').toUpperCase().slice(0, 4);
};
