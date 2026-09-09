import { Router } from 'express';
import { prisma } from '../../../config/database.js';
import {
  requireAdminLevel,
  requireAuth,
  requireRole,
} from '../../auth/middleware/auth.middleware.js';
import { DashboardController } from './dashboard.controller.js';
import { DashboardRepository } from './dashboard.repository.js';
import { DashboardService } from './dashboard.service.js';

const repository = new DashboardRepository(prisma);
const service = new DashboardService(repository);
const controller = new DashboardController(service);

export const adminDashboardRouter = Router();

adminDashboardRouter.use(requireAuth, requireRole('ADMIN'));

// Le dashboard expose des données financières : SUPER_ADMIN uniquement.
// SUPPORT et MODERATEUR ne doivent pas voir le volume brut des commandes.
adminDashboardRouter.get('/', requireAdminLevel('SUPER_ADMIN'), controller.get);

export default adminDashboardRouter;