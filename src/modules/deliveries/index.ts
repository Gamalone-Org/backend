import { prisma } from '../../config/database.js';
import { DeliveryRepository } from './delivery.repository.js';
import { DeliveryService } from './delivery.service.js';
import { DeliveryController } from './delivery.controller.js';

export { adminDeliveryRouter } from './delivery.routes.js';
export { DeliveryRepository } from './delivery.repository.js';
export { DeliveryService, CSV_EXPORT_LIMIT } from './delivery.service.js';
export { DeliveryController } from './delivery.controller.js';
export * as deliverySchema from './delivery.schema.js';

export function createDeliveriesModule() {
  const repository = new DeliveryRepository(prisma);
  const service = new DeliveryService(repository);
  const controller = new DeliveryController(service);

  return {
    repository,
    service,
    controller,
  };
}