import { buildApp } from './app.ts';
import { attachDevClient, attachStaticClient, CLIENT_BUILD_DIR } from './client.ts';
import { loadConfig } from './config.ts';
import { createDependencies } from './dependencies.ts';
import { StartupError } from './errors.ts';
import { listenOnLoopback, LOOPBACK_HOST } from './listen.ts';
import { createLogger } from './logger.ts';
import { createHandlers } from './routes/handlers.ts';
import { developmentCsp, PRODUCTION_CSP } from './security/headers.ts';
import { createToken } from './security/token.ts';

const main = async (): Promise<void> => {
  const config = await loadConfig(process.argv.slice(2));
  const logger = createLogger();
  const token = createToken();
  const app = await buildApp({
    logger,
    port: config.port,
    token,
    contentSecurityPolicy: config.dev ? developmentCsp(config.port) : PRODUCTION_CSP,
    handlers: createHandlers(await createDependencies(config, logger)),
  });
  if (config.dev) {
    await attachDevClient(app);
  } else {
    await attachStaticClient(app, CLIENT_BUILD_DIR);
  }
  await listenOnLoopback(app, config.port);
  process.stdout.write(
    `ArtifactForge is running at http://${LOOPBACK_HOST}:${config.port}/#token=${token}\n`,
  );
};

main().catch((error: unknown) => {
  const message = error instanceof StartupError ? error.message : String(error);
  process.stderr.write(`ArtifactForge could not start: ${message}\n`);
  process.exit(1);
});
