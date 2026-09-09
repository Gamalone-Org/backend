import { Router } from 'express';
import { requireAuth, requireRole, requireAdminLevel } from '../auth/middleware/auth.middleware.js';
import { ReviewController } from './review.controller.js';
import { ReviewService } from './review.service.js';
import { ReviewRepository } from './review.repository.js';
import { prisma } from '../../config/database.js';

const reviewRepository = new ReviewRepository(prisma);
const reviewService = new ReviewService(reviewRepository);
const controller = new ReviewController(reviewService);

export const adminReviewRouter = Router();

adminReviewRouter.use(requireAuth, requireRole('ADMIN'));

// Le chemin /export doit être déclaré AVANT /:id pour ne pas être interprété
// comme un identifiant d'avis.
adminReviewRouter.get('/export', requireAdminLevel('SUPPORT'), controller.exportCsv);
adminReviewRouter.get('/', requireAdminLevel('SUPPORT'), controller.list);
adminReviewRouter.get('/:id', requireAdminLevel('SUPPORT'), controller.getOne);

export default adminReviewRouter;