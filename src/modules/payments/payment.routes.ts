import { Router } from 'express';
import { prisma } from '../../config/database.js';
import { requireAuth, requireRole } from '../auth/middleware/auth.middleware.js';
import { PaymentController } from './payment.controller.js';
import { PaymentRepository } from './payment.repository.js';
import { PaymentService } from './payment.service.js';

const paymentService = new PaymentService(new PaymentRepository(prisma));
const paymentController = new PaymentController(paymentService);

export const paymentRouter = Router();

/**
 * @swagger
 * /api/v1/paiements/webhooks/fedapay:
 *   post:
 *     summary: Webhook FedaPay désactivé
 *     description: Endpoint désactivé. Retourne le code 410 Gone. Aucun traitement métier ni modification de données n'est effectuée.
 *     tags: [Payments]
 *     security: []
 *     responses:
 *       410:
 *         description: Webhook FedaPay désactivé (gone).
 *       default:
 *         description: Erreur inattendue.
 */
paymentRouter.post('/webhooks/fedapay', (_req, res) => {
  res.status(410).json({ success: false, message: 'Webhook FedaPay désactivé (statut 410 Gone).' });
});

/**
 * @swagger
 * /api/v1/paiements/webhooks/paydunya:
 *   post:
 *     summary: IPN PayDunya (public, application/x-www-form-urlencoded)
 *     description: >
 *       Callback officiel PayDunya. Le champ data.hash est vérifié via SHA-512 de la clé principale.
 *       Le statut est confirmé côté serveur via l'API PayDunya avant toute transition.
 *     tags: [Payments]
 *     security: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema: { type: object }
 *     responses:
 *       200:
 *         description: IPN accepté (traité ou ignoré de façon idempotente).
 *       400:
 *         description: Hash ou corps IPN invalide.
 *       500:
 *         description: PayDunya non configuré.
 *       502:
 *         description: PayDunya indisponible pour la confirmation.
 */
paymentRouter.post('/webhooks/paydunya', paymentController.handlePayDunyaIpn);

// Toutes les autres routes de paiement exigent un acheteur authentifié.
paymentRouter.use(requireAuth, requireRole('ACHETEUR'));

/**
 * @swagger
 * /api/v1/paiements/commandes/{id}/initialiser:
 *   post:
 *     summary: Initialiser le paiement PayDunya d'une commande
 *     description: >
 *       Génère une facture PayDunya et retourne l'URL de paiement sécurisée.
 *       Remplace l'ancienne intégration FedaPay.
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Lien sécurisé de paiement prêt à être ouvert par l'acheteur.
 *       400:
 *         description: Identifiant ou données acheteur invalides.
 *       404:
 *         description: Commande introuvable.
 *       409:
 *         description: Commande ou paiement non payable, ou initialisation déjà en cours.
 *       500:
 *         description: PayDunya non configuré (clés manquantes).
 *       502:
 *         description: PayDunya indisponible ou réponse invalide.
 */
paymentRouter.post('/commandes/:id/initialiser', paymentController.initializeOrderPayment);
