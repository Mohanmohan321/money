import type { RequestHandler } from 'express';

import { AppError } from './errors';

const stateChangingMethods = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export function enforceSameOrigin(appOrigin: string): RequestHandler {
  return (request, _response, next) => {
    if (!stateChangingMethods.has(request.method)) {
      next();
      return;
    }

    const origin = request.get('origin');
    if (origin && origin !== appOrigin) {
      next(new AppError(403, 'ORIGIN_FORBIDDEN', 'Request origin is not allowed'));
      return;
    }
    next();
  };
}
