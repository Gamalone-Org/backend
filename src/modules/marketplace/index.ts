import { prisma } from '../../config/database.js';
import { CloudinaryService } from '../../shared/services/cloudinary/index.js';
import { OeuvreRepository } from './oeuvre.repository.js';
import { MediaRepository } from './media.repository.js';
import { OeuvreService } from './oeuvre.service.js';
import { MediaService } from './media.service.js';
import { OeuvreController } from './oeuvre.controller.js';

export { artisanOeuvreRouter } from './oeuvre.routes.js';
export { adminOeuvreRouter } from './oeuvre.admin.routes.js';
export { publicOeuvreRouter } from './oeuvre.public.routes.js';
export { OeuvreRepository } from './oeuvre.repository.js';
export { MediaRepository } from './media.repository.js';
export { OeuvreService } from './oeuvre.service.js';
export { MediaService } from './media.service.js';
export { OeuvreController } from './oeuvre.controller.js';
export * as oeuvreSchema from './oeuvre.schema.js';

export function createMarketplaceModule() {
  const cloudinaryService = new CloudinaryService();
  const oeuvreRepository = new OeuvreRepository(prisma);
  const mediaRepository = new MediaRepository(prisma, () => cloudinaryService);
  const oeuvreService = new OeuvreService(oeuvreRepository);
  const mediaService = new MediaService(mediaRepository, oeuvreRepository);
  const controller = new OeuvreController(oeuvreService, mediaService);

  return {
    cloudinaryService,
    oeuvreRepository,
    mediaRepository,
    oeuvreService,
    mediaService,
    controller,
  };
}
