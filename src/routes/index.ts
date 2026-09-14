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
import { publicOeuvreRouter } from '../modules/marketplace/oeuvre.public.routes.js';
import { artisanPublicRouter } from '../modules/artisans/artisan-public.routes.js';
import { myCommandeRouter } from '../modules/orders/order.routes.js';
import { adminCommandeRouter } from '../modules/orders/order.admin.routes.js';
import { artisanCommandeRouter } from '../modules/orders/order.artisan.routes.js';
import { adminArticleRouter } from '../modules/articles/article.routes.js';
import { adminUserRouter } from '../modules/users/users.routes.js';
import { adminDashboardRouter } from '../modules/admin/dashboard/dashboard.routes.js';
import { adminArtisansRouter } from '../modules/admin/artisans/admin-artisans.routes.js';
import { adminDeliveryRouter } from '../modules/deliveries/delivery.routes.js';
import { adminReviewRouter } from '../modules/reviews/review.routes.js';
import { adminDisputeRouter } from '../modules/disputes/dispute.routes.js';
import { artisanProfilRouter } from '../modules/artisan-profile/artisan-profile.routes.js';
import { adminAdministrateursRouter } from '../modules/admin/administrateurs/index.js';
import { favoriRouter } from '../modules/favorites/favorites.routes.js';

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
router.use('/v1/artisan/commandes', artisanCommandeRouter);
router.use('/v1/artisan/profil', artisanProfilRouter);
router.use('/v1/admin/oeuvres', adminOeuvreRouter);
router.use('/v1/artisans', artisanPublicRouter);
router.use('/v1/oeuvres', publicOeuvreRouter);

router.use('/v1/commandes', myCommandeRouter);
router.use('/v1/admin/commandes', adminCommandeRouter);

router.use('/v1/admin/articles', adminArticleRouter);

router.use('/v1/admin/users', adminUserRouter);

router.use('/v1/admin/dashboard', adminDashboardRouter);

router.use('/v1/admin/artisans', adminArtisansRouter);

router.use('/v1/admin/livraisons', adminDeliveryRouter);

router.use('/v1/admin/avis', adminReviewRouter);

router.use('/v1/admin/litiges', adminDisputeRouter);

router.use('/v1/admin/administrateurs', adminAdministrateursRouter);

router.use('/v1/favoris', favoriRouter);

export default router;
