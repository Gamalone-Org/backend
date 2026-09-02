import { Router } from 'express';
import {
  requireAdminLevel,
  requireAuth,
  requireRole,
} from '../auth/middleware/auth.middleware.js';
import { UserController } from './users.controller.js';
import { UserService } from './users.service.js';
import { UserRepository } from './users.repository.js';
import { prisma } from '../../config/database.js';

const repository = new UserRepository(prisma);
const service = new UserService(repository);
const controller = new UserController(service);

export const adminUserRouter = Router();

adminUserRouter.use(requireAuth, requireRole('ADMIN'));

// SUPPORT : lecture seule (liste, détail, export)
adminUserRouter.get('/', requireAdminLevel('SUPPORT'), controller.list);
adminUserRouter.get('/export', requireAdminLevel('SUPPORT'), controller.exportCsv);
adminUserRouter.get('/:id', requireAdminLevel('SUPPORT'), controller.getOne);

// MODERATEUR : création + changement de statut
adminUserRouter.post('/', requireAdminLevel('MODERATEUR'), controller.create);
adminUserRouter.patch('/:id/statut', requireAdminLevel('MODERATEUR'), controller.updateStatut);

// SUPER_ADMIN : changement de rôle (opération sensible)
adminUserRouter.patch('/:id/role', requireAdminLevel('SUPER_ADMIN'), controller.updateRole);

export default adminUserRouter;
