import { Router } from 'express';
import { prisma } from '../../config/database.js';
import { requireAuth, requireRole, requireAdminLevel } from '../auth/middleware/auth.middleware.js';
import { PaymentController } from './payment.controller.js';
import { PaymentRepository } from './payment.repository.js';
import { PaymentService } from './payment.service.js';

const paymentService = new PaymentService(new PaymentRepository(prisma));
const paymentController = new PaymentController(paymentService);

export const adminPaymentRouter = Router();

adminPaymentRouter.use(requireAuth, requireRole('ADMIN'));

/**
 * @swagger
 * /api/v1/admin/paiements:
 *   get:
 *     summary: Lister les paiements (back-office)
 *     description: >
 *       Liste paginée des paiements, tous statuts confondus. Filtres : statut,
 *       anomalie de réconciliation (`reconciliationRequise`), recherche libre
 *       (`q` : référence de transaction, ou identifiant de commande si UUID) et
 *       plage de dates sur la date de création.
 *     tags: [Admin Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema: { type: integer, minimum: 1, default: 1 }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, minimum: 1, maximum: 50, default: 20 }
 *       - in: query
 *         name: statut
 *         schema:
 *           type: string
 *           enum: [EN_ATTENTE, EN_COURS, REUSSI, ECHOUE, REMBOURSE]
 *       - in: query
 *         name: reconciliationRequise
 *         schema: { type: boolean }
 *       - in: query
 *         name: q
 *         description: Référence de transaction, ou UUID de commande.
 *         schema: { type: string }
 *       - in: query
 *         name: dateFrom
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: dateTo
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Liste paginée des paiements.
 *       401:
 *         description: Authentification requise.
 *       403:
 *         description: Accès réservé au personnel administratif.
 */
adminPaymentRouter.get('/', requireAdminLevel('SUPPORT'), paymentController.listAdmin);

/**
 * @swagger
 * /api/v1/admin/paiements/{id}:
 *   get:
 *     summary: Détail d'un paiement (back-office)
 *     description: >
 *       Détail d'un paiement : contexte commande/acheteur, historique des
 *       tentatives et des événements prestataire. Les diagnostics sensibles sont
 *       nettoyés avant exposition.
 *     tags: [Admin Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string, format: uuid }
 *     responses:
 *       200:
 *         description: Détail du paiement.
 *       404:
 *         description: Paiement introuvable.
 *       401:
 *         description: Authentification requise.
 *       403:
 *         description: Accès réservé au personnel administratif.
 */
adminPaymentRouter.get('/:id', requireAdminLevel('SUPPORT'), paymentController.getAdmin);
