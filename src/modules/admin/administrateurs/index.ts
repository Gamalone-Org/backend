import { prisma } from '../../../config/database.js';
import { AdministrateurController } from './administrateurs.controller.js';
import { AdministrateurRepository } from './administrateurs.repository.js';
import { AdministrateurService } from './administrateurs.service.js';

export { adminAdministrateursRouter } from './administrateurs.routes.js';
export { AdministrateurController } from './administrateurs.controller.js';
export { AdministrateurRepository } from './administrateurs.repository.js';
export { AdministrateurService } from './administrateurs.service.js';
export {
  administrateurParamsSchema,
  listAdministrateursQuerySchema,
} from './administrateurs.schema.js';

export function createAdministrateurModule() {
  const repository = new AdministrateurRepository(prisma);
  const service = new AdministrateurService(repository);
  const controller = new AdministrateurController(service);
  return { repository, service, controller };
}
