import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound: RequestHandler = (_request, _response, next) => {
  next(new AppError(404, 'NOT_FOUND', 'Resource not found'));
};

const isMalformedJsonError = (
  error: unknown,
): error is SyntaxError & { status: number; type: string } =>
  error instanceof SyntaxError &&
  'status' in error &&
  error.status === 400 &&
  'type' in error &&
  error.type === 'entity.parse.failed';

export const errorHandler: ErrorRequestHandler = (error, request, response, _next) => {
  const knownError =
    error instanceof AppError
      ? error
      : error instanceof ZodError
        ? new AppError(400, 'VALIDATION_ERROR', error.issues[0]?.message ?? 'Invalid request')
        : isMalformedJsonError(error)
          ? new AppError(400, 'MALFORMED_JSON', 'Malformed JSON request body')
          : new AppError(500, 'INTERNAL_ERROR', 'An unexpected error occurred');

  if (
    !(error instanceof AppError) &&
    !(error instanceof ZodError) &&
    !isMalformedJsonError(error)
  ) {
    console.error('Unhandled API error', {
      requestId: response.locals.requestId,
      method: request.method,
      path: request.path,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }

  response.status(knownError.status).json({
    success: false,
    error: { code: knownError.code, message: knownError.message },
  });
};
