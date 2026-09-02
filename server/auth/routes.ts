import { Router, type CookieOptions } from 'express';
import rateLimit from 'express-rate-limit';

import { loginSchema } from '../../shared/contracts';
import type { AppConfig } from '../config';
import { AppError } from '../middleware/errors';
import { readSessionToken } from '../middleware/auth';
import {
  createSessionToken,
  hashSessionToken,
  passwordsMatch,
  sessionCookieName,
  sessionDurationMs,
} from './session';
import type { SessionStore } from './session-store';

function cookieOptions(config: AppConfig): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.nodeEnv === 'production',
    signed: true,
    path: '/',
    maxAge: sessionDurationMs,
  };
}

export function createAuthRouter(config: AppConfig, sessionStore: SessionStore): Router {
  const router = Router();
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 5,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_request, response) => {
      response.status(429).json({
        success: false,
        error: { code: 'LOGIN_RATE_LIMITED', message: 'Too many login attempts; try again later' },
      });
    },
  });

  router.post('/login', loginLimiter, async (request, response) => {
    const { password } = loginSchema.parse(request.body);
    if (!passwordsMatch(password, config.appPassword)) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid password');
    }

    const now = new Date();
    const token = createSessionToken();
    await sessionStore.deleteExpired?.(now);
    await sessionStore.create(hashSessionToken(token), new Date(now.getTime() + sessionDurationMs));
    response.cookie(sessionCookieName, token, cookieOptions(config));
    response.json({ success: true, data: { authenticated: true } });
  });

  router.post('/logout', async (request, response) => {
    const token = readSessionToken(request);
    if (token) {
      await sessionStore.delete(hashSessionToken(token));
    }
    response.clearCookie(sessionCookieName, cookieOptions(config));
    response.json({ success: true, data: { authenticated: false } });
  });

  router.get('/me', async (request, response) => {
    const token = readSessionToken(request);
    const authenticated = Boolean(
      token && (await sessionStore.isValid(hashSessionToken(token), new Date())),
    );
    if (!authenticated) {
      response.clearCookie(sessionCookieName, cookieOptions(config));
    }
    response.json({ success: true, data: { authenticated } });
  });

  return router;
}
