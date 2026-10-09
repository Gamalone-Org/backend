import { CategorieArticleController } from './categorie-article.controller.js';
import { CategorieArticleRepository } from './categorie-article.repository.js';
import { CategorieArticleService } from './categorie-article.service.js';
import { prisma } from '../../config/database.js';
import { CloudinaryService } from '../../shared/services/cloudinary/index.js';

export {
  adminArticleCategorieRouter,
  publicArticleCategorieRouter,
} from './categorie-article.routes.js';
export { CategorieArticleRepository } from './categorie-article.repository.js';
export { CategorieArticleService } from './categorie-article.service.js';
export { CategorieArticleController } from './categorie-article.controller.js';
export * as categorieArticleSchema from './categorie-article.schema.js';

export function createCategorieArticleModule() {
  const repository = new CategorieArticleRepository(prisma, () => new CloudinaryService());
  const service = new CategorieArticleService(repository);
  const controller = new CategorieArticleController(service);
  return { repository, service, controller };
}
