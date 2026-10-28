const STORAGE_KEY = 'artifactforge.token';

let sessionToken: string | null = null;

const readStored = (): string | null => {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch {
    // Storage can be blocked; the token then lives only in memory for this page load.
    return null;
  }
};

const store = (token: string): void => {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, token);
  } catch {
    // Same as above: memory-only is acceptable, a reload then needs the start-up URL again.
  }
};

/** Moves the start-up token out of the URL fragment so it does not linger in history. */
export const initSessionToken = (): void => {
  const fromUrl = new URLSearchParams(window.location.hash.slice(1)).get('token');
  if (fromUrl) {
    store(fromUrl);
    window.history.replaceState(null, '', window.location.pathname + window.location.search);
    sessionToken = fromUrl;
    return;
  }
  sessionToken = readStored();
};

export const getSessionToken = (): string | null => sessionToken;
