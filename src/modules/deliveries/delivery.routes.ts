import { Router } from 'express';
import { requireAuth, requireRole, requireAdminLevel } from '../auth/middleware/auth.middleware.js';
import { DeliveryController } from './delivery.controller.js';
import { DeliveryService } from './delivery.service.js';
import { DeliveryRepository } from './delivery.repository.js';
import { prisma } from '../../config/database.js';

const deliveryRepository = new DeliveryRepository(prisma);
const deliveryService = new DeliveryService(deliveryRepository);
const controller = new DeliveryController(deliveryService);

export const adminDeliveryRouter = Router();

adminDeliveryRouter.use(requireAuth, requireRole('ADMIN'));

// Le chemin /export doit être déclaré AVANT /:id pour ne pas être interprété
// comme un identifiant de livraison.
adminDeliveryRouter.get('/export', requireAdminLevel('SUPPORT'), controller.exportCsv);
adminDeliveryRouter.get('/', requireAdminLevel('SUPPORT'), controller.list);
adminDeliveryRouter.get('/:id', requireAdminLevel('SUPPORT'), controller.getOne);
adminDeliveryRouter.patch('/:id', requireAdminLevel('MODERATEUR'), controller.update);
adminDeliveryRouter.patch('/:id/statut', requireAdminLevel('MODERATEUR'), controller.updateStatus);

export default adminDeliveryRouter;