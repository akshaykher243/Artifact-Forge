import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createContext, runInContext } from 'node:vm';

export const ARTIFACT_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'docs',
  'prflow report redesign – Review execution order and diffs.html',
);

type ArtifactRow = [string, number | null, number | null, string];

/** One function on an entry point's path, as the artifact's report lists it. */
export interface ArtifactStepRow {
  id: string;
  k: string;
  depth: number;
  name: string;
  sub: string;
  change: 'added' | 'signature' | 'body' | null;
  earlier: boolean;
  add?: number;
  del?: number;
  kind?: string;
}

export interface ArtifactStep {
  n: number;
  kind: string;
  label: string;
  file: string;
  rows: ArtifactStepRow[];
}

export interface ArtifactFunctionDiff {
  name: string;
  file: string;
  line: number;
  change: 'added' | 'signature' | 'body' | null;
  rows: ArtifactRow[];
  add: number;
  del: number;
}

export interface ArtifactData {
  meta: { repo: string; base: string; head: string; baseSha: string; headSha: string };
  steps: ArtifactStep[];
  diffs: Record<string, ArtifactFunctionDiff>;
  files: { p: string; a: number; r: number; st: string; old: string | null }[];
  fileDiffs: Record<string, ArtifactRow[]>;
}

/** The artifact's own functions, run as-is so ported code can be compared with the original. */
export interface ArtifactModule {
  SMALL: ArtifactData;
  buildLarge: () => ArtifactData;
  tokenize: (text: string) => unknown[];
  segments: (text: string, a: number, b: number, hl: string | null) => unknown[];
  wordRange: (oldText: string, newText: string) => unknown;
  toSplit: (rows: ArtifactRow[]) => unknown[];
  /** The component's `mapVals` for `data`, with the given state and no path lens. */
  mapVals: (data: ArtifactData, state: Record<string, unknown>) => Record<string, unknown>;
}

const readLogicScript = (): string => {
  const html = readFileSync(ARTIFACT_PATH, 'utf8');
  const template = /<script type="__bundler\/template">([\s\S]*?)<\/script>/.exec(html)?.[1];
  if (template === undefined) {
    throw new Error(`No bundler template found in ${ARTIFACT_PATH}`);
  }
  const page = JSON.parse(template) as string;
  const script = /<script type="text\/x-dc"[^>]*>([\s\S]*?)<\/script>/.exec(page)?.[1];
  if (script === undefined) {
    throw new Error('No x-dc logic script found in the artifact template');
  }
  return script;
};

/**
 * Evaluates the artifact's inline logic in an isolated context. The code is the project's own
 * exported reference file; its component class needs a stand-in base class to load.
 */
export const loadArtifactModule = (): ArtifactModule => {
  const context = createContext({});
  const mapVals =
    'mapVals: (data, state) => { DATA = data; return Component.prototype.mapVals.call({ setState: () => {} }, state, null); }';
  const exportList = `({ SMALL, buildLarge, tokenize, segments, wordRange, toSplit, ${mapVals} })`;
  return runInContext(`class DCLogic {}\n${readLogicScript()}\n;${exportList}`, context, {
    filename: 'artifact-logic.js',
  }) as ArtifactModule;
};
