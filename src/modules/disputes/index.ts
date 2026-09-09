import { prisma } from '../../config/database.js';
import { DisputeRepository } from './dispute.repository.js';
import { DisputeService } from './dispute.service.js';
import { DisputeController } from './dispute.controller.js';

export { adminDisputeRouter } from './dispute.routes.js';
export { DisputeRepository } from './dispute.repository.js';
export { DisputeService, CSV_EXPORT_LIMIT } from './dispute.service.js';
export { DisputeController } from './dispute.controller.js';
export * as disputeSchema from './dispute.schema.js';

export function createDisputesModule() {
  const repository = new DisputeRepository(prisma);
  const service = new DisputeService(repository);
  const controller = new DisputeController(service);

  return {
    repository,
    service,
    controller,
  };
}