import type { Request, RequestHandler } from 'express';

import { hashSessionToken, sessionCookieName } from '../auth/session';
import type { SessionStore } from '../auth/session-store';
import { AppError } from './errors';

export function readSessionToken(request: Request): string | undefined {
  const value = request.signedCookies?.[sessionCookieName];
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function requireAuth(sessionStore: SessionStore): RequestHandler {
  return async (request, _response, next) => {
    const token = readSessionToken(request);
    if (!token || !(await sessionStore.isValid(hashSessionToken(token), new Date()))) {
      next(new AppError(401, 'AUTH_REQUIRED', 'Authentication required'));
      return;
    }
    next();
  };
}
