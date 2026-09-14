import { Router } from 'express';
import { prisma } from '../../../config/database.js';
import {
  requireAuth,
  requireRole,
  requirePermission,
} from '../../auth/middleware/auth.middleware.js';
import { AdministrateurController } from './administrateurs.controller.js';
import { AdministrateurRepository } from './administrateurs.repository.js';
import { AdministrateurService } from './administrateurs.service.js';

const repository = new AdministrateurRepository(prisma);
const service = new AdministrateurService(repository);
const controller = new AdministrateurController(service);

export const adminAdministrateursRouter = Router();

// Toutes les routes de ce module sont réservées aux comptes ADMIN dont le
// compte possède les permissions ADMINS_* (en pratique : SUPER_ADMIN seul).
adminAdministrateursRouter.use(requireAuth, requireRole('ADMIN'));

adminAdministrateursRouter.get('/', requirePermission('ADMINS_READ'), controller.list);
adminAdministrateursRouter.get('/:id', requirePermission('ADMINS_READ'), controller.getOne);
adminAdministrateursRouter.post('/', requirePermission('ADMINS_CREATE'), controller.create);
adminAdministrateursRouter.patch('/:id', requirePermission('ADMINS_UPDATE'), controller.update);
adminAdministrateursRouter.patch(
  '/:id/permissions',
  requirePermission('ADMINS_MANAGE'),
  controller.updatePermissions
);
adminAdministrateursRouter.patch(
  '/:id/statut',
  requirePermission('ADMINS_UPDATE'),
  controller.updateStatut
);

export default adminAdministrateursRouter;
