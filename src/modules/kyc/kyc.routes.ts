import { Router } from 'express';
import { prisma } from '../../config/database.js';
import { requireAuth } from '../auth/middleware/auth.middleware.js';
import { kycUploadMiddleware } from './middleware/kyc-upload.middleware.js';
import { KycController } from './kyc.controller.js';
import { KycRepository } from './kyc.repository.js';
import { KycService } from './kyc.service.js';

const router = Router();
const repository = new KycRepository(prisma);
const service = new KycService(repository);
const controller = new KycController(service);

router.post('/submit', requireAuth, controller.submit);
router.post('/resubmit', requireAuth, controller.resubmit);
router.get('/me', requireAuth, controller.getMine);
router.get('/:id', requireAuth, controller.getById);
router.get('/:id/documents', requireAuth, controller.getDocuments);
router.post('/:id/documents', requireAuth, kycUploadMiddleware, controller.uploadDocument);
router.delete('/:id/documents/:documentId', requireAuth, controller.deleteDocument);

export default router;

