import { Router } from 'express';
import { prisma } from '../../config/database.js';
import { requireAuth, requireRole, requireAdminLevel } from '../auth/middleware/auth.middleware.js';
import { PayoutBatchController } from './payout-batch.controller.js';
import { PayoutBatchRepository } from './payout-batch.repository.js';
import { PayoutBatchService } from './payout-batch.service.js';

const payoutBatchService = new PayoutBatchService(new PayoutBatchRepository(prisma));
const payoutBatchController = new PayoutBatchController(payoutBatchService);

export const adminPayoutBatchRouter = Router();

adminPayoutBatchRouter.use(requireAuth, requireRole('ADMIN'));

adminPayoutBatchRouter.get('/', requireAdminLevel('SUPPORT'), payoutBatchController.listAdmin);
// Route statique déclarée AVANT `/:id` pour ne pas être capturée comme identifiant.
adminPayoutBatchRouter.get(
  '/eligibles',
  requireAdminLevel('SUPPORT'),
  payoutBatchController.listEligibles
);
adminPayoutBatchRouter.get('/:id', requireAdminLevel('SUPPORT'), payoutBatchController.getAdmin);
adminPayoutBatchRouter.post('/preparer', requireAdminLevel('SUPER_ADMIN'), payoutBatchController.prepare);
adminPayoutBatchRouter.post('/:id/confirmer', requireAdminLevel('SUPER_ADMIN'), payoutBatchController.confirm);
adminPayoutBatchRouter.post('/:id/annuler', requireAdminLevel('SUPER_ADMIN'), payoutBatchController.cancel);
