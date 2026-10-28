export interface GitHubRepo {
  owner: string;
  name: string;
}

export interface RemoteInfo {
  github: GitHubRepo | null;
  ssh: boolean;
}

const SEGMENT = '[A-Za-z0-9._-]{1,100}';
const GITHUB_SSH = [
  new RegExp(`^git@github\\.com:(${SEGMENT})/(${SEGMENT}?)(?:\\.git)?/?$`),
  new RegExp(`^ssh://git@github\\.com(?::22)?/(${SEGMENT})/(${SEGMENT}?)(?:\\.git)?/?$`),
];
const GITHUB_HTTPS = new RegExp(`^https://github\\.com/(${SEGMENT})/(${SEGMENT}?)(?:\\.git)?/?$`);
const OTHER_SSH = /^(ssh:\/\/|[\w.-]+@[\w.-]+:)/;

const toRepo = (match: RegExpExecArray | null): GitHubRepo | null => {
  const owner = match?.[1];
  const name = match?.[2];
  const dotsOnly = /^\.+$/;
  if (
    owner === undefined ||
    name === undefined ||
    name === '' ||
    owner.startsWith('.') ||
    dotsOnly.test(name)
  ) {
    return null;
  }
  return { owner, name };
};

/** Recognises GitHub remotes and whether a remote URL uses SSH. */
export const parseRemoteUrl = (url: string): RemoteInfo => {
  for (const pattern of GITHUB_SSH) {
    const repo = toRepo(pattern.exec(url));
    if (repo !== null) {
      return { github: repo, ssh: true };
    }
  }
  const https = toRepo(GITHUB_HTTPS.exec(url));
  if (https !== null) {
    return { github: https, ssh: false };
  }
  return { github: null, ssh: OTHER_SSH.test(url) };
};
