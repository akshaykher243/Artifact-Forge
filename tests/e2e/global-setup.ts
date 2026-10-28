import { build } from 'vite';

/** End-to-end tests run against the production build, so build it once per run. */
const globalSetup = async (): Promise<void> => {
  await build({ configFile: 'vite.config.ts', logLevel: 'warn' });
};

export default globalSetup;
