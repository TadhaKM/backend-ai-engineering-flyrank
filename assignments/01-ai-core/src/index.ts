/**
 * Assignment 01 — AI Core. Entrypoint.
 *
 * Loads + validates config, builds the logger and the dependency graph, then
 * starts the HTTP server. All wiring lives in server.ts; this file only owns the
 * `listen()` side effect.
 */
import { createLogger } from '@flyrank/shared';
import { loadConfig, redactConfig } from './config/index.ts';
import { buildDependencies, createApp } from './server.ts';

function main(): void {
  const config = loadConfig();
  const logger = createLogger({ name: '01-ai-core', level: config.server.logLevel });

  const deps = buildDependencies(config, logger);
  const app = createApp({ ...deps, logger });

  const server = app.listen(config.server.port, () => {
    logger.info('server.listening', {
      port: config.server.port,
      config: redactConfig(config),
    });
  });

  const shutdown = (signal: string) => {
    logger.info('server.shutdown', { signal });
    server.close(() => process.exit(0));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main();
