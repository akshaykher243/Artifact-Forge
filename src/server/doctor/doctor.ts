import type { StartupSettings } from '../config.ts';
import { findBinary } from '../config.ts';
import { createProcessRunner } from '../security/run-process.ts';
import {
  checkClientBuild,
  checkDataDir,
  checkGh,
  checkGit,
  checkGithubOverSsh,
  checkNode,
  checkPort,
  checkRoots,
} from './checks.ts';
import type { Check } from './checks.ts';

export interface DoctorInput {
  settings: StartupSettings;
  nodeVersion: string;
  clientBuildDir: string;
}

/** Every check `pnpm start` and pull request review depend on, in the order they matter. */
export const runDoctor = async ({
  settings,
  nodeVersion,
  clientBuildDir,
}: DoctorInput): Promise<Check[]> => {
  const runProcess = createProcessRunner({ env: settings.childEnv, log: () => undefined });
  const find = (name: string) => findBinary(name, settings.searchPath);
  const [git, gh, ssh] = await Promise.all([find('git'), find('gh'), find('ssh')]);
  const cwd = settings.homeDir;
  return [
    checkNode(nodeVersion),
    await checkGit(runProcess, git, cwd),
    await checkClientBuild(clientBuildDir),
    await checkRoots(settings),
    await checkDataDir(settings.dataDir),
    await checkPort(settings.port),
    await checkGithubOverSsh(runProcess, ssh, cwd),
    await checkGh(runProcess, gh, cwd),
  ];
};

const MARK: Record<Check['status'], string> = { ok: '✓', warn: '!', fail: '✗' };

const summary = (checks: readonly Check[]): string => {
  const failed = checks.filter((check) => check.status === 'fail').length;
  if (failed > 0) {
    return `${failed} problem(s) stop ArtifactForge from starting. Fix them, then run pnpm run doctor again.`;
  }
  if (checks.some((check) => check.status === 'warn')) {
    return 'Ready to start (pnpm start). Pull request review needs the items marked !.';
  }
  return 'Everything is ready. Start with: pnpm start';
};

/** The report as printed: one line per check, its fix indented below it. */
export const formatReport = (checks: readonly Check[]): string => {
  const lines = ['ArtifactForge doctor', ''];
  for (const check of checks) {
    lines.push(`  ${MARK[check.status]} ${check.name}: ${check.detail}`);
    if (check.fix !== null) {
      lines.push(`      ${check.fix}`);
    }
  }
  lines.push('', summary(checks));
  return `${lines.join('\n')}\n`;
};
