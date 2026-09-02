import { Router } from 'express';
import { requireAuth, requireRole, requireAdminLevel } from '../auth/middleware/auth.middleware.js';
import { OrderController } from './order.controller.js';
import { OrderService } from './order.service.js';
import { OrderRepository } from './order.repository.js';
import { prisma } from '../../config/database.js';

const orderRepository = new OrderRepository(prisma);
const orderService = new OrderService(orderRepository);
const controller = new OrderController(orderService);

export const adminCommandeRouter = Router();

adminCommandeRouter.use(requireAuth, requireRole('ADMIN'));

adminCommandeRouter.get('/export', requireAdminLevel('SUPPORT'), controller.exportCsv);
adminCommandeRouter.get('/', requireAdminLevel('SUPPORT'), controller.listAdmin);
adminCommandeRouter.get('/:id', requireAdminLevel('SUPPORT'), controller.getAdmin);
adminCommandeRouter.post('/:id/statut', requireAdminLevel('MODERATEUR'), controller.updateStatut);
adminCommandeRouter.post('/:id/annuler', requireAdminLevel('MODERATEUR'), controller.annuler);

export default adminCommandeRouter;
