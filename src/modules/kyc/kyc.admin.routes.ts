import { Router } from 'express';
import { prisma } from '../../config/database.js';
import { requireAuth, requireRole } from '../auth/middleware/auth.middleware.js';
import { KycController } from './kyc.controller.js';
import { KycRepository } from './kyc.repository.js';
import { KycService } from './kyc.service.js';

const router = Router();
const repository = new KycRepository(prisma);
const service = new KycService(repository);
const controller = new KycController(service);

router.use(requireAuth, requireRole('ADMIN'));

router.get('/', controller.listPendingReviews);
router.get('/:id/history', controller.getReviewHistory);
router.get('/:id', controller.getAdminDetailsById);
router.post('/:id/approve', controller.approve);
router.post('/:id/reject', controller.reject);
router.post('/:id/request-correction', controller.requestCorrection);

export default router;
