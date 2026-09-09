import { Router } from 'express';
import { requireAuth, requireRole, requireAdminLevel } from '../auth/middleware/auth.middleware.js';
import { DisputeController } from './dispute.controller.js';
import { DisputeService } from './dispute.service.js';
import { DisputeRepository } from './dispute.repository.js';
import { prisma } from '../../config/database.js';

const disputeRepository = new DisputeRepository(prisma);
const disputeService = new DisputeService(disputeRepository);
const controller = new DisputeController(disputeService);

export const adminDisputeRouter = Router();

adminDisputeRouter.use(requireAuth, requireRole('ADMIN'));

// Le chemin /export doit être déclaré AVANT /:id pour ne pas être interprété
// comme un identifiant de litige.
adminDisputeRouter.get('/export', requireAdminLevel('SUPPORT'), controller.exportCsv);
adminDisputeRouter.get('/', requireAdminLevel('SUPPORT'), controller.list);
adminDisputeRouter.get('/:id', requireAdminLevel('SUPPORT'), controller.getOne);

export default adminDisputeRouter;