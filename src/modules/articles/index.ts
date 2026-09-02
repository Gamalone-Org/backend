import { ArticleController } from './article.controller.js';
import { ArticleRepository } from './article.repository.js';
import { ArticleService } from './article.service.js';
import { prisma } from '../../config/database.js';
import { CloudinaryService } from '../../shared/services/cloudinary/index.js';

export {
  adminArticleRouter,
} from './article.routes.js';
export { ArticleRepository } from './article.repository.js';
export { ArticleService } from './article.service.js';
export { ArticleController } from './article.controller.js';
export * as articleSchema from './article.schema.js';
export { slugify, uniqueSlug } from '../categories/slug.util.js';

export function createArticleModule() {
  const repository = new ArticleRepository(prisma, () => new CloudinaryService());
  const service = new ArticleService(repository);
  const controller = new ArticleController(service);
  return { repository, service, controller };
}
