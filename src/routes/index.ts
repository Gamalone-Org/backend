import type { Request, Response } from 'express';
import { Router } from 'express';
import authRouter from '../modules/auth/routes/auth.routes.js';
import adminKycRouter from '../modules/kyc/kyc.admin.routes.js';
import kycRouter from '../modules/kyc/kyc.routes.js';

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

router.use('/v1/auth', authRouter);
router.use('/v1/kyc', kycRouter);
router.use('/v1/admin/kyc', adminKycRouter);

export default router;
