import type { Request, Response } from 'express';
import { Router } from 'express';

const router = Router();

/**
 * Health Check endpoint
 * GET /api/v1/health
 */
router.get('/v1/health', (_req: Request, res: Response) => {
  res.status(200).json({
    success: true,
    message: 'GAMALONE API is running',
  });
});

export default router;
