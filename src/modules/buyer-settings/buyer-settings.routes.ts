import { Router } from 'express';
import { requireAuth, requireRole } from '../auth/middleware/auth.middleware.js';
import { BuyerSettingsController } from './buyer-settings.controller.js';
import { BuyerSettingsService } from './buyer-settings.service.js';
import { BuyerSettingsRepository } from './buyer-settings.repository.js';
import { prisma } from '../../config/database.js';

const repository = new BuyerSettingsRepository(prisma);
const service = new BuyerSettingsService(repository);
const controller = new BuyerSettingsController(service);

export const buyerParametresRouter = Router();

// Paramètres acheteur : authentifié + rôle ACHETEUR obligatoires. Le profil
// est toujours résolu depuis req.user.id, jamais depuis le body.
buyerParametresRouter.use(requireAuth, requireRole('ACHETEUR'));

buyerParametresRouter.get('/', controller.getParametres);
buyerParametresRouter.patch('/', controller.updateParametres);

export default buyerParametresRouter;