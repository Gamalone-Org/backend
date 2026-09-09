import { Router } from 'express';
import {
  requireAdminLevel,
  requireAuth,
  requireRole,
} from '../../auth/middleware/auth.middleware.js';
import { AdminArtisansController } from './admin-artisans.controller.js';
import { AdminArtisansService } from './admin-artisans.service.js';
import { AdminArtisansRepository } from './admin-artisans.repository.js';
import { prisma } from '../../../config/database.js';

const repository = new AdminArtisansRepository(prisma);
const service = new AdminArtisansService(repository);
const controller = new AdminArtisansController(service);

export const adminArtisansRouter = Router();

adminArtisansRouter.use(requireAuth, requireRole('ADMIN'));

// SUPPORT : lecture seule — liste, détail, œuvres, commandes (sans documents KYC)
adminArtisansRouter.get('/', requireAdminLevel('SUPPORT'), controller.list);
adminArtisansRouter.get('/:id', requireAdminLevel('SUPPORT'), controller.getDetail);
adminArtisansRouter.get('/:id/artworks', requireAdminLevel('SUPPORT'), controller.listArtworks);
adminArtisansRouter.get('/:id/orders', requireAdminLevel('SUPPORT'), controller.listOrders);

export default adminArtisansRouter;