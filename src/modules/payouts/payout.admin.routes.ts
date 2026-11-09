import { Router } from 'express';
import { prisma } from '../../config/database.js';
import { requireAuth, requireRole, requireAdminLevel } from '../auth/middleware/auth.middleware.js';
import { PayoutController } from './payout.controller.js';
import { PayoutRepository } from './payout.repository.js';
import { PayoutService } from './payout.service.js';

const payoutService = new PayoutService(new PayoutRepository(prisma));
const payoutController = new PayoutController(payoutService);

export const adminPayoutRouter = Router();

adminPayoutRouter.use(requireAuth, requireRole('ADMIN'));

/**
 * @swagger
 * /api/v1/admin/reversements:
 *   get:
 *     summary: Lister les reversements artisans
 *     description: >
 *       Liste paginée des reversements. Filtres : statut, artisanId, commandeId,
 *       recherche libre (`q` : référence prestataire, ou UUID de commande /
 *       sous-commande) et plage de dates sur la date de création.
 *       Niveau SUPPORT minimum.
 *     tags: [Admin Reversements]
 *     security:
 *       - bearerAuth: []
 */
adminPayoutRouter.get('/', requireAdminLevel('SUPPORT'), payoutController.listAdmin);

/**
 * @swagger
 * /api/v1/admin/reversements/a-effectuer:
 *   get:
 *     summary: Lister les reversements à effectuer (éligibles)
 *     description: >
 *       Sous-commandes artisan éligibles à un reversement (livrées, payées,
 *       réception confirmée, sans reversement existant). Le délai de 72 h est
 *       informatif (`dateEcheance`, `delaiExpire`) et ne bloque pas le
 *       déclenchement. Niveau SUPPORT minimum.
 *     tags: [Admin Reversements]
 *     security:
 *       - bearerAuth: []
 */
adminPayoutRouter.get('/a-effectuer', requireAdminLevel('SUPPORT'), payoutController.listAEfectuer);

/**
 * @swagger
 * /api/v1/admin/reversements/{id}:
 *   get:
 *     summary: Détail d'un reversement
 *     description: >
 *       Détail d'un reversement : montants, destination masquée, historique des
 *       tentatives. Les coordonnées bénéficiaires brutes ne sont jamais
 *       exposées. Niveau SUPPORT minimum.
 *     tags: [Admin Reversements]
 *     security:
 *       - bearerAuth: []
 */
adminPayoutRouter.get('/:id', requireAdminLevel('SUPPORT'), payoutController.getAdmin);

/**
 * @swagger
 * /api/v1/admin/reversements/artisans/{commandeArtisanId}/declencher:
 *   post:
 *     summary: Déclencher le reversement d'une sous-commande artisan
 *     description: >
 *       Crée et démarre le reversement FedaPay (idempotent : un seul
 *       reversement par sous-commande). Réservé au SUPER_ADMIN. Refusé si les
 *       reversements ne sont pas activés (FEDAPAY_PAYOUTS_ENABLED).
 *     tags: [Admin Reversements]
 *     security:
 *       - bearerAuth: []
 */
adminPayoutRouter.post(
  '/artisans/:commandeArtisanId/declencher',
  requireAdminLevel('SUPER_ADMIN'),
  (_req, res) => {
    res.status(410).json({
      success: false,
      message: "Les reversements automatiques FedaPay ne sont plus disponibles. Utilisez les reversements manuels groupés.",
      code: 'PAYOUTS_AUTOMATIC_DISABLED',
    });
  }
);

/**
 * @swagger
 * /api/v1/admin/reversements/{id}/relancer:
 *   post:
 *     summary: Relancer un reversement échoué
 *     description: >
 *       Rejoue un reversement au statut ECHOUE via une nouvelle tentative
 *       (aucun second reversement si un état distant ambigu existe).
 *       Réservé au SUPER_ADMIN.
 *     tags: [Admin Reversements]
 *     security:
 *       - bearerAuth: []
 */
adminPayoutRouter.post('/:id/relancer', requireAdminLevel('SUPER_ADMIN'), (_req, res) => {
  res.status(410).json({
    success: false,
    message: "Les reversements automatiques FedaPay ne sont plus disponibles. Utilisez les reversements manuels groupés.",
    code: 'PAYOUTS_AUTOMATIC_DISABLED',
  });
});

/**
 * @swagger
 * /api/v1/admin/reversements/{id}/synchroniser:
 *   post:
 *     summary: Synchroniser le statut d'un reversement
 *     description: >
 *       Récupère l'état réel chez FedaPay et l'applique localement. N'initie
 *       jamais de nouvelle transaction. Réservé au SUPER_ADMIN.
 *     tags: [Admin Reversements]
 *     security:
 *       - bearerAuth: []
 */
adminPayoutRouter.post(
  '/:id/synchroniser',
  requireAdminLevel('SUPER_ADMIN'),
  payoutController.synchroniser
);
