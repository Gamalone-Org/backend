import { createHash, timingSafeEqual } from 'node:crypto';
import { Router } from 'express';
import type { Request, Response, NextFunction } from 'express';
import { env } from '../../config/env.js';
import { NotFoundError, UnauthorizedError } from '../../common/errors/AppError.js';
import { runKycPurgeBounded } from './kyc-purge.service.js';

/**
 * Internal, cron-only KYC purge entrypoint (Vercel Cron).
 *
 * Security:
 * - Disabled (404) when no `CRON_SECRET` is configured, so it is inert in
 *   environments where the purge must not run automatically.
 * - Requires `Authorization: Bearer <CRON_SECRET>` (what Vercel sends when the
 *   CRON_SECRET env var is set) or `x-cron-secret`. Comparison is
 *   timing-safe.
 * - Runs the existing purge service in bounded batches so a single serverless
 *   invocation stays well under the function timeout.
 */
const router = Router();

const CRON_SECRET = env.CRON_SECRET;

function secretMatches(candidate: string): boolean {
  if (!CRON_SECRET) {
    return false;
  }

  const expectedHash = createHash('sha256').update(CRON_SECRET).digest();
  const candidateHash = createHash('sha256').update(candidate).digest();
  return timingSafeEqual(expectedHash, candidateHash);
}

function isAuthorized(req: Request): boolean {
  const authorization = req.headers.authorization;
  if (typeof authorization === 'string') {
    const token = authorization.split(/\s+/)[1];
    if (token && secretMatches(token)) {
      return true;
    }
  }

  const headerSecret = req.headers['x-cron-secret'];
  return typeof headerSecret === 'string' && headerSecret.length > 0 && secretMatches(headerSecret);
}

router.all('/kyc/purge/cron', async (req: Request, res: Response, next: NextFunction) => {
  try {
    if (!CRON_SECRET) {
      next(new NotFoundError('Route not found'));
      return;
    }

    if (!isAuthorized(req)) {
      next(new UnauthorizedError('Unauthorized'));
      return;
    }

    const result = await runKycPurgeBounded();
    res.status(200).json({ success: true, message: 'KYC purge completed', result });
  } catch (error) {
    next(error);
  }
});

export default router;
