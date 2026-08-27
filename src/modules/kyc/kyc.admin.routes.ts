import { Router } from 'express';
import { requireAuth, requireRole } from '../auth/middleware/auth.middleware.js';
import { createKycModule } from './kyc.factory.js';

const router = Router();
const { controller } = createKycModule();

router.use(requireAuth, requireRole('ADMIN'));

router.get('/', controller.listPendingReviews);
router.post('/purge/run', controller.runPurge);
router.get('/:id/history', controller.getReviewHistory);
router.get('/:id', controller.getAdminDetailsById);
router.post('/:id/approve', controller.approve);
router.post('/:id/reject', controller.reject);
router.post('/:id/request-correction', controller.requestCorrection);
router.post('/:id/legal-hold', controller.setLegalHold);
router.post('/:id/anonymize', controller.anonymize);

export default router;
