import { Router } from 'express';
import { ArtisanPublicController } from './artisan-public.controller.js';
import { ArtisanPublicService } from './artisan-public.service.js';
import { ArtisanPublicRepository } from './artisan-public.repository.js';
import { prisma } from '../../config/database.js';

// ---------------------------------------------------------------------------
// Dependency wiring
// ---------------------------------------------------------------------------

const repository = new ArtisanPublicRepository(prisma);
const service = new ArtisanPublicService(repository);
const controller = new ArtisanPublicController(service);

// ---------------------------------------------------------------------------
// Public router — no auth required
// ---------------------------------------------------------------------------

export const artisanPublicRouter = Router();

// IMPORTANT: declare specific routes BEFORE dynamic ones to avoid capture
artisanPublicRouter.get('/', controller.list);
artisanPublicRouter.get('/:identifier/oeuvres', controller.listOeuvres);
artisanPublicRouter.get('/:identifier', controller.getProfile);

export default artisanPublicRouter;
