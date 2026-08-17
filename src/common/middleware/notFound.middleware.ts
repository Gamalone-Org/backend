import type { Request, Response, NextFunction } from 'express';
import { NotFoundError } from '../errors/index.js';

/**
 * 404 Not Found middleware
 * Handles all requests that don't match any route
 */
export function notFoundMiddleware(_req: Request, _res: Response, next: NextFunction): void {
  next(new NotFoundError('Route not found'));
}
