import { prisma } from '../../config/database.js';
import { UserController } from './users.controller.js';
import { UserRepository } from './users.repository.js';
import { UserService } from './users.service.js';

export { adminUserRouter } from './users.routes.js';
export { UserRepository } from './users.repository.js';
export { UserService, CSV_EXPORT_LIMIT } from './users.service.js';
export { UserController } from './users.controller.js';

export function createUserModule() {
  const repository = new UserRepository(prisma);
  const service = new UserService(repository);
  const controller = new UserController(service);
  return { repository, service, controller };
}
