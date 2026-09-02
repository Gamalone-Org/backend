import { Router } from 'express';
import { requireAuth, requireRole } from '../auth/middleware/auth.middleware.js';
import { OeuvreController } from './oeuvre.controller.js';
import { OeuvreService } from './oeuvre.service.js';
import { MediaService } from './media.service.js';
import { OeuvreRepository } from './oeuvre.repository.js';
import { MediaRepository } from './media.repository.js';
import { prisma } from '../../config/database.js';
import { CloudinaryService } from '../../shared/services/cloudinary/index.js';

const oeuvreRepository = new OeuvreRepository(prisma);
const mediaRepository = new MediaRepository(prisma, () => new CloudinaryService());
const oeuvreService = new OeuvreService(oeuvreRepository);
const mediaService = new MediaService(mediaRepository, oeuvreRepository);
const controller = new OeuvreController(oeuvreService, mediaService);

export const artisanOeuvreRouter = Router();

artisanOeuvreRouter.use(requireAuth, requireRole('ARTISAN'));

artisanOeuvreRouter.get('/', controller.listMy);
artisanOeuvreRouter.get('/:id', controller.getMy);

export default artisanOeuvreRouter;
