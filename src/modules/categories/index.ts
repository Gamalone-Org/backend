import { CategorieController } from './categorie.controller.js';
import { CategorieRepository } from './categorie.repository.js';
import { CategorieService } from './categorie.service.js';
import { prisma } from '../../config/database.js';
import { CloudinaryService } from '../../shared/services/cloudinary/index.js';

export { publicCategorieRouter, adminCategorieRouter } from './categorie.routes.js';
export { CategorieRepository } from './categorie.repository.js';
export { CategorieService } from './categorie.service.js';
export { CategorieController } from './categorie.controller.js';
export * as categorieSchema from './categorie.schema.js';
export { slugify, uniqueSlug } from './slug.util.js';

export function createCategorieModule() {
  const repository = new CategorieRepository(prisma, () => new CloudinaryService());
  const service = new CategorieService(repository);
  const controller = new CategorieController(service);
  return { repository, service, controller };
}
