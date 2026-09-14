import { prisma } from '../../config/database.js';
import { OrderRepository } from './order.repository.js';
import { OrderService } from './order.service.js';
import { OrderController } from './order.controller.js';

export { myCommandeRouter } from './order.routes.js';
export { adminCommandeRouter } from './order.admin.routes.js';
export { artisanCommandeRouter } from './order.artisan.routes.js';
export { OrderRepository } from './order.repository.js';
export { OrderService } from './order.service.js';
export { OrderController } from './order.controller.js';
export * as orderSchema from './order.schema.js';

export function createOrdersModule() {
  const repository = new OrderRepository(prisma);
  const service = new OrderService(repository);
  const controller = new OrderController(service);

  return {
    repository,
    service,
    controller,
  };
}
