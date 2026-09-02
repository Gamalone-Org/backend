import { Router } from 'express';
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

export const publicOeuvreRouter = Router();
export const publicArtisanRouter = Router();

publicOeuvreRouter.get('/', controller.listPublic);
publicOeuvreRouter.get('/featured', controller.listFeatured);
publicOeuvreRouter.get('/:id', controller.getPublic);

publicArtisanRouter.get('/:artisanId/oeuvres', controller.listByArtisanPublic);
