import { Router } from 'express';
import { requireAuth, requireRole } from '../auth/middleware/auth.middleware.js';
import { OrderController } from './order.controller.js';
import { OrderService } from './order.service.js';
import { OrderRepository } from './order.repository.js';
import { prisma } from '../../config/database.js';

const orderRepository = new OrderRepository(prisma);
const orderService = new OrderService(orderRepository);
const controller = new OrderController(orderService);

export const myCommandeRouter = Router();

myCommandeRouter.use(requireAuth, requireRole('ACHETEUR'));

myCommandeRouter.post('/', controller.create);
myCommandeRouter.get('/', controller.listMine);
myCommandeRouter.get('/:id', controller.getMine);

export default myCommandeRouter;
