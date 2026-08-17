import type { Request, Response, NextFunction } from 'express';
import { AppError } from './AppError.js';

export function errorHandler(
  error: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (error instanceof AppError) {
    res.status(error.statusCode).json(error.toJSON());
    return;
  }

  if (error instanceof Error) {
    // Log the error but don't expose internal details
    console.error('Unhandled error:', error.message);

    res.status(500).json({
      success: false,
      message: 'Internal server error',
      code: 'INTERNAL_SERVER_ERROR',
    });
    return;
  }

  console.error('Unknown error:', error);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    code: 'INTERNAL_SERVER_ERROR',
  });
}
