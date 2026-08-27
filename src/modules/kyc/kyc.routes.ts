import { Router } from 'express';
import { requireAuth } from '../auth/middleware/auth.middleware.js';
import { createKycModule } from './kyc.factory.js';
import { kycUploadMiddleware } from './middleware/kyc-upload.middleware.js';

const router = Router();
const { controller } = createKycModule();

router.post('/submit', requireAuth, controller.submit);
router.post('/resubmit', requireAuth, controller.resubmit);
router.get('/me', requireAuth, controller.getMine);
router.get('/:id', requireAuth, controller.getById);
router.get('/:id/documents', requireAuth, controller.getDocuments);
router.post('/:id/documents', requireAuth, kycUploadMiddleware, controller.uploadDocument);
router.delete('/:id/documents/:documentId', requireAuth, controller.deleteDocument);

export default router;
