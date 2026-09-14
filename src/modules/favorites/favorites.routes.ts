import { Router } from 'express';
import { requireAuth, requireRole } from '../auth/middleware/auth.middleware.js';
import { FavoriteController } from './favorites.controller.js';
import { FavoriteService } from './favorites.service.js';
import { FavoriteRepository } from './favorites.repository.js';
import { prisma } from '../../config/database.js';

const favoriteRepository = new FavoriteRepository(prisma);
const favoriteService = new FavoriteService(favoriteRepository);
const controller = new FavoriteController(favoriteService);

export const favoriRouter = Router();

favoriRouter.use(requireAuth, requireRole('ACHETEUR'));

favoriRouter.get('/', controller.list);
favoriRouter.post('/:oeuvreId', controller.add);
favoriRouter.delete('/:oeuvreId', controller.remove);

export default favoriRouter;