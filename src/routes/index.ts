import type { Request, Response } from 'express';
import { Router } from 'express';
import authRouter from '../modules/auth/routes/auth.routes.js';
import adminKycRouter from '../modules/kyc/kyc.admin.routes.js';
import kycRouter from '../modules/kyc/kyc.routes.js';
import kycCronRouter from '../modules/kyc/kyc-cron.routes.js';
import {
  publicCategorieRouter,
  adminCategorieRouter,
} from '../modules/categories/categorie.routes.js';
import { artisanOeuvreRouter } from '../modules/marketplace/oeuvre.routes.js';
import { adminOeuvreRouter } from '../modules/marketplace/oeuvre.admin.routes.js';
import {
  publicOeuvreRouter,
  publicArtisanRouter,
} from '../modules/marketplace/oeuvre.public.routes.js';
import { myCommandeRouter } from '../modules/orders/order.routes.js';
import { adminCommandeRouter } from '../modules/orders/order.admin.routes.js';
import {
  adminArticleRouter,
} from '../modules/articles/article.routes.js';
import { adminUserRouter } from '../modules/users/users.routes.js';

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
router.use('/v1/internal', kycCronRouter);
router.use('/v1/categories', publicCategorieRouter);
router.use('/v1/admin/categories', adminCategorieRouter);

router.use('/v1/artisan/oeuvres', artisanOeuvreRouter);
router.use('/v1/admin/oeuvres', adminOeuvreRouter);
router.use('/v1/artisans', publicArtisanRouter);
router.use('/v1/oeuvres', publicOeuvreRouter);

router.use('/v1/commandes', myCommandeRouter);
router.use('/v1/admin/commandes', adminCommandeRouter);

router.use('/v1/admin/articles', adminArticleRouter);

router.use('/v1/admin/users', adminUserRouter);

export default router;
