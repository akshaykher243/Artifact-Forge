import { CLIENT_BUILD_DIR } from '../client.ts';
import { readSettings } from '../config.ts';
import { StartupError } from '../errors.ts';
import { formatReport, runDoctor } from './doctor.ts';

const main = async (): Promise<void> => {
  const checks = await runDoctor({
    settings: readSettings(process.argv.slice(2)),
    nodeVersion: process.versions.node,
    clientBuildDir: CLIENT_BUILD_DIR,
  });
  process.stdout.write(formatReport(checks));
  process.exitCode = checks.some((check) => check.status === 'fail') ? 1 : 0;
};

main().catch((error: unknown) => {
  const message = error instanceof StartupError ? error.message : String(error);
  process.stderr.write(`pnpm doctor could not run: ${message}\n`);
  process.exit(1);
});
