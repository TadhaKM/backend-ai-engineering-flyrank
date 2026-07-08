/**
 * Composition root + Express app assembly.
 *
 * `buildDependencies` wires the object graph once, using constructor injection
 * throughout (config -> gateway -> provider -> service). `createApp` mounts the
 * middleware and routes. Keeping app construction separate from `listen()`
 * (which lives in index.ts) makes the app importable and testable.
 */
import express, { type Express } from 'express';
import type { Logger } from '@flyrank/shared';
import type { AppConfig } from './config/index.ts';
import { createGatewayClient } from './ai/gateway.ts';
import { ClaudeProvider } from './ai/claude.ts';
import { buildToolRegistry } from './ai/tools.ts';
import { ChatService } from './ai/chatService.ts';
import { loadSampleData, type CurrentUser } from './ai/toolContext.ts';
import { createChatRouter } from './routes/chat.ts';
import { createErrorHandler } from './utils/errorHandler.ts';

export interface AppDependencies {
  chatService: ChatService;
  currentUser: CurrentUser;
}

/** Build the runtime object graph from config. Pure wiring — no side effects,
 *  no network. The AI client is created lazily (on the first request). */
export function buildDependencies(config: AppConfig, logger: Logger): AppDependencies {
  const provider = new ClaudeProvider({
    getClient: () => createGatewayClient(config),
    config,
  });

  const chatService = new ChatService({
    provider,
    registry: buildToolRegistry(),
    data: loadSampleData(),
    config,
    logger,
  });

  // Stand-in principal. A real service would derive this from auth middleware.
  const currentUser: CurrentUser = {
    id: 'user_demo',
    name: 'the FlyRank team',
    roles: ['engineer'],
  };

  return { chatService, currentUser };
}

export interface CreateAppDeps extends AppDependencies {
  logger: Logger;
}

export function createApp(deps: CreateAppDeps): Express {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: '01-ai-core' });
  });

  app.use(createChatRouter({ chatService: deps.chatService, currentUser: deps.currentUser }));

  // 404 for anything unmatched.
  app.use((_req, res) => {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Route not found.' } });
  });

  // Central error handler — must be last.
  app.use(createErrorHandler(deps.logger));

  return app;
}
