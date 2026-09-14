import { Router } from 'express';
import { requireAuth, requireRole } from '../auth/middleware/auth.middleware.js';
import { OrderController } from './order.controller.js';
import { OrderService } from './order.service.js';
import { OrderRepository } from './order.repository.js';
import { prisma } from '../../config/database.js';

const orderRepository = new OrderRepository(prisma);
const orderService = new OrderService(orderRepository);
const controller = new OrderController(orderService);

export const artisanCommandeRouter = Router();

artisanCommandeRouter.use(requireAuth, requireRole('ARTISAN'));

artisanCommandeRouter.get('/', controller.listArtisan);
artisanCommandeRouter.get('/:id', controller.getArtisan);
artisanCommandeRouter.post('/:id/preparer', controller.preparer);
artisanCommandeRouter.post('/:id/expedier', controller.expedier);

export default artisanCommandeRouter;