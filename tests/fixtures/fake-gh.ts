import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const FAKE_GH_BIN_DIR = join(import.meta.dirname, '..', 'bin');

export interface FakeGhRule {
  args: string[];
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  delayMs?: number;
}

export interface FakeGhCall {
  args: string[];
  stdin: string;
}

export interface FakeGh {
  /** Use as HOME for the app under test; the fake reads its scenario from here. */
  home: string;
  /** The PATH that puts the fake first, ahead of any real gh. */
  path: string;
  setRules: (rules: FakeGhRule[]) => Promise<void>;
  calls: () => Promise<FakeGhCall[]>;
  remove: () => Promise<void>;
}

export const createFakeGh = async (): Promise<FakeGh> => {
  const home = await realpath(await mkdtemp(join(tmpdir(), 'af-fake-gh-')));
  const dir = join(home, 'fake-gh');
  await mkdir(dir);
  return {
    home,
    path: `${FAKE_GH_BIN_DIR}:${process.env.PATH ?? ''}`,
    setRules: (rules) => writeFile(join(dir, 'scenario.json'), JSON.stringify({ rules })),
    calls: async () => {
      try {
        const text = await readFile(join(dir, 'calls.jsonl'), 'utf8');
        return text
          .split('\n')
          .filter((line) => line !== '')
          .map((line) => JSON.parse(line) as FakeGhCall);
      } catch {
        return [];
      }
    },
    remove: () => rm(home, { recursive: true, force: true }),
  };
};

export const authStatusRule = (login: string | null): FakeGhRule => ({
  args: ['auth', 'status'],
  stdout: JSON.stringify({
    hosts:
      login === null
        ? {}
        : {
            'github.com': [
              { state: 'success', active: true, host: 'github.com', login, tokenSource: 'keyring' },
            ],
          },
  }),
});

export interface FakePr {
  number: number;
  title?: string;
  state?: 'OPEN' | 'CLOSED' | 'MERGED';
  baseRefName?: string;
  headRefName?: string;
  baseRefOid: string;
  headRefOid: string;
}

export const prViewRule = (pr: FakePr): FakeGhRule => ({
  args: ['pr', 'view', String(pr.number)],
  stdout: JSON.stringify({
    number: pr.number,
    title: pr.title ?? 'Add multi-currency support',
    state: pr.state ?? 'OPEN',
    isDraft: false,
    url: `https://github.com/acme/platform/pull/${pr.number}`,
    baseRefName: pr.baseRefName ?? 'main',
    headRefName: pr.headRefName ?? 'feature',
    baseRefOid: pr.baseRefOid,
    headRefOid: pr.headRefOid,
    isCrossRepository: false,
    author: { login: 'octo-author' },
  }),
});

/** Writes rules for a fake gh whose HOME is `home` (e.g. a running e2e app's `ghHome`). */
export const writeFakeGhRules = async (home: string, rules: FakeGhRule[]): Promise<void> => {
  await mkdir(join(home, 'fake-gh'), { recursive: true });
  await writeFile(join(home, 'fake-gh', 'scenario.json'), JSON.stringify({ rules }));
};

export const readFakeGhCalls = async (home: string): Promise<FakeGhCall[]> => {
  try {
    const text = await readFile(join(home, 'fake-gh', 'calls.jsonl'), 'utf8');
    return text
      .split('\n')
      .filter((line) => line !== '')
      .map((line) => JSON.parse(line) as FakeGhCall);
  } catch {
    return [];
  }
};
