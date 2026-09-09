import { prisma } from '../../config/database.js';
import { ReviewRepository } from './review.repository.js';
import { ReviewService } from './review.service.js';
import { ReviewController } from './review.controller.js';

export { adminReviewRouter } from './review.routes.js';
export { ReviewRepository } from './review.repository.js';
export { ReviewService, CSV_EXPORT_LIMIT } from './review.service.js';
export { ReviewController } from './review.controller.js';
export * as reviewSchema from './review.schema.js';

export function createReviewsModule() {
  const repository = new ReviewRepository(prisma);
  const service = new ReviewService(repository);
  const controller = new ReviewController(service);

  return {
    repository,
    service,
    controller,
  };
}