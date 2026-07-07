/**
 * POST /chat — the single public endpoint.
 *
 * Deliberately thin: validate the request, call the AI service, return its
 * structured result. It knows nothing about Claude, Portkey, tools, or SQL —
 * that's the whole point of the service seam. Thrown errors (ZodError,
 * ConfigError, UpstreamAiError, StructuredOutputError, …) propagate to the
 * central error handler; Express 5 forwards async rejections automatically.
 */
import { Router } from 'express';
import type { ChatService } from '../ai/chatService.ts';
import { ChatRequestSchema } from '../ai/schemas.ts';
import type { CurrentUser } from '../ai/toolContext.ts';

export interface ChatRouterDeps {
  chatService: ChatService;
  currentUser: CurrentUser;
}

export function createChatRouter(deps: ChatRouterDeps): Router {
  const router = Router();

  router.post('/chat', async (req, res) => {
    // Throws ZodError on a bad body -> mapped to 400 by the error handler.
    const { message } = ChatRequestSchema.parse(req.body ?? {});
    const result = await deps.chatService.chat(message, deps.currentUser);
    res.json({ answer: result.answer, meta: result.meta });
  });

  return router;
}
