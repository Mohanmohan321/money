import { randomUUID } from 'node:crypto';
import path from 'node:path';

import cookieParser from 'cookie-parser';
import express, { Router, type RequestHandler } from 'express';
import helmet from 'helmet';

import { createAuthRouter } from './auth/routes';
import type { SessionStore } from './auth/session-store';
import type { AppConfig } from './config';
import { requireAuth } from './middleware/auth';
import { errorHandler, notFound } from './middleware/errors';
import { enforceSameOrigin } from './middleware/origin';

export interface AppDependencies {
  config: AppConfig;
  sessionStore: SessionStore;
  protectedRouter?: Router;
}

function requestMetadata(config: AppConfig): RequestHandler {
  return (request, response, next) => {
    const requestId = randomUUID();
    response.locals.requestId = requestId;
    response.setHeader('X-Request-Id', requestId);

    if (config.nodeEnv !== 'test') {
      const startedAt = performance.now();
      response.on('finish', () => {
        console.info('HTTP request', {
          requestId,
          method: request.method,
          path: request.path,
          status: response.statusCode,
          durationMs: Math.round(performance.now() - startedAt),
        });
      });
    }
    next();
  };
}

export function createApp({ config, sessionStore, protectedRouter = Router() }: AppDependencies) {
  const app = express();
  if (config.nodeEnv === 'production') {
    app.set('trust proxy', 1);
  }

  app.disable('x-powered-by');
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        workerSrc: ["'self'", 'blob:'],
        scriptSrc: ["'self'", "'wasm-unsafe-eval'", 'https://cdn.jsdelivr.net'],
        connectSrc: ["'self'", 'https://cdn.jsdelivr.net'],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        styleSrc: ["'self'"],
      },
    },
  }));
  app.use(requestMetadata(config));
  app.use(enforceSameOrigin(config.appOrigin));
  app.use(express.json({ limit: '16kb' }));
  app.use(cookieParser(config.sessionSecret));

  app.get('/healthz', (_request, response) => {
    response.json({ success: true, data: { status: 'ok' } });
  });
  app.use('/api/auth', createAuthRouter(config, sessionStore));
  app.use('/api', requireAuth(sessionStore), protectedRouter);

  if (config.nodeEnv === 'production') {
    const clientDirectory = path.resolve(process.cwd(), 'dist/client');
    app.use(express.static(clientDirectory));
    app.use((request, response, next) => {
      if (request.method === 'GET' && !request.path.startsWith('/api/')) {
        response.sendFile(path.join(clientDirectory, 'index.html'));
        return;
      }
      next();
    });
  }

  app.use(notFound);
  app.use(errorHandler);
  return app;
}
