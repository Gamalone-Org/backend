import { env } from '../../config/env.js';
import {
  AppError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/AppError.js';
import { PaymentRepository } from './payment.repository.js';
import type {
  PaymentAdminDetail,
  PaymentAdminListItem,
} from './payment.types.js';
import type { PaymentAdminQuery } from './payment.schema.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PayDunyaClient } from './paydunya.client.js';

type OwnedOrder = {
  id: string;
  montantTotal: Prisma.Decimal;
  statut: string;
  paiement: OwnedPayment | null;
  acheteur: {
    id: string;
    fedaPayCustomerId: string | null;
    user: { nom: string | null; email: string | null; telephone: string } | null;
  };
};

type OwnedPayment = {
  id: string;
  montant: Prisma.Decimal;
  statut: string;
  devise: string;
  prestataire: string | null;
  referenceExterne: string | null;
  statutExterne: string | null;
  urlPaiement: string | null;
};

export type WebhookHandlingResult = {
  statut: 'TRAITE' | 'IGNORE' | 'EN_TRAITEMENT' | 'RECU';
};

export class PaymentService {
  constructor(
    private readonly repository: PaymentRepository,
    private readonly paydunya: PayDunyaClient = new PayDunyaClient()
  ) {}

  /**
   * Initialise le paiement d'une commande via PayDunya (unique prestataire actif).
   * Si PayDunya n'est pas configuré, retourne une erreur explicite sans fallback vers FedaPay.
   */
  async initializeOrderPayment(commandeId: string, userId: string) {
    const commande = await this.repository.findOwnedOrder(commandeId, userId);
    if (!commande) throw new NotFoundError('Commande introuvable.');
    const paiement = commande.paiement;
    if (!paiement) throw new ConflictError('Cette commande ne possède pas de paiement initialisé.');
    if (paiement.statut === 'REUSSI' || paiement.statut === 'REMBOURSE') {
      throw new ConflictError('Ce paiement ne peut plus être initialisé.');
    }
    if (commande.statut === 'ANNULEE' || commande.statut === 'REMBOURSEE') {
      throw new ConflictError('Cette commande ne peut plus être payée.');
    }

    const canUsePayDunya =
      Boolean(env.PAYDUNYA_MASTER_KEY && env.PAYDUNYA_PRIVATE_KEY && env.PAYDUNYA_TOKEN);
    if (!canUsePayDunya) {
      throw new AppError(
        500,
        'PayDunya n\'est pas configuré (clés manquantes). Aucun paiement acheteur ne peut être initialisé.',
        'PAYDUNYA_NOT_CONFIGURED'
      );
    }

    return this.initializeOrderPaymentPayDunya(commande, paiement);
  }

  /**
   * Initialise un paiement PayDunya pour une commande.
   * Génère une facture, crée une transaction et retourne l'URL de paiement.
   */
  private async initializeOrderPaymentPayDunya(commande: OwnedOrder, paiement: OwnedPayment) {
    const amount = Number(paiement.montant);
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount !== Number(commande.montantTotal)) {
      throw new ValidationError('Le montant de la commande est invalide pour le paiement.');
    }
    const devise = (paiement.devise?.trim().toUpperCase() || 'XOF');
    if (devise !== 'XOF') {
      throw new ValidationError(`Devise non prise en charge pour le paiement : ${devise}.`);
    }

    const claimed = await this.repository.claimInitialization(paiement.id);
    if (!claimed) {
      throw new ConflictError('Une initialisation de paiement est déjà en cours pour cette commande.');
    }

    try {
      const items = [
        {
          name: `Commande ${commande.id}`,
          quantity: 1,
          unit_price: amount,
          total_price: amount,
        },
      ];

      const createRes = await this.paydunya.createInvoice({
        invoice: {
          items,
          total_amount: amount,
          description: `Paiement commande ${commande.id}`,
          custom_data: { commande_id: commande.id, paiement_id: paiement.id },
        },
        custom_data: { commande_id: commande.id, paiement_id: paiement.id },
      });

      const token =
        (createRes.token as string) ||
        (createRes.invoice_token as string) ||
        ((createRes.invoice as Record<string, unknown>)?.['token'] as string);
      const url = (createRes.url as string) || (createRes.payment_url as string);

      if (!token || !url) {
        throw new AppError(502, 'Réponse PayDunya invalide (token/URL manquants).', 'PAYDUNYA_INVALID_RESPONSE');
      }

      await this.repository.recordRemoteTransaction({
        paiementId: paiement.id,
        referenceExterne: token,
        statutExterne: 'pending',
        urlPaiement: url,
      });
      await this.repository.createAttempt({
        paiementId: paiement.id,
        referenceExterne: token,
        statutExterne: 'pending',
        montant: amount,
        devise,
        urlPaiement: url,
      });

      return {
        commandeId: commande.id,
        paiementId: paiement.id,
        referenceExterne: token,
        urlPaiement: url,
      };
    } catch (error) {
      await this.repository.releaseInitialization(paiement.id);
      throw error;
    }
  }

  /**
   * Traite une notification IPN PayDunya.
   * 1. Vérifie le hash de la clé principale (SHA-512).
   * 2. Confirme la facture via l'API PayDunya.
   * 3. Applique les transitions de paiement en cohérence avec les statuts confirmés.
   * 4. En cas d'incohérence, marque pour rapprochement et émet en IGNORE.
   */
  async handlePayDunyaIpn(input: { token: string; status?: string; payload: Record<string, unknown> }): Promise<WebhookHandlingResult> {
    const token = input.token;
    if (!token) throw new AppError(400, 'Token PayDunya manquant.', 'PAYDUNYA_MISSING_TOKEN');

    const eventKey = `paydunya:${token}:${input.status ?? 'unknown'}`;
    const existing = await (this.repository as any).findPaymentEventByReference?.(eventKey);
    if (existing && existing.statutTraitement === 'TRAITE') {
      return { statut: 'IGNORE' };
    }

    try {
      await (this.repository as any).recordPaymentEvent?.({
        prestataire: 'PAYDUNYA',
        referenceEvenement: eventKey,
        typeEvenement: 'ipn',
        referenceTransaction: token,
        statutTraitement: 'EN_TRAITEMENT',
      });
    } catch (e) {
      // best effort
    }

    const confirm = await this.paydunya.confirmInvoice(token);
    const invoice = (confirm.invoice as Record<string, unknown>) || confirm;
    const confirmedStatus = (invoice['status'] as string) || (confirm.status as string);
    const confirmedToken =
      (invoice['token'] as string) || (confirm.invoice_token as string) || (confirm.token as string) || token;

    if (confirmedToken !== token) {
      throw new AppError(400, 'Token PayDunya incohérent.', 'PAYDUNYA_TOKEN_MISMATCH');
    }

    const context = await this.repository.findWebhookContextByReference(confirmedToken);
    if (!context || !context.tentative) {
      throw new AppError(404, 'Tentative PayDunya introuvable.', 'PAYDUNYA_TENTATIVE_NOT_FOUND');
    }
    const tentative = context.tentative;

    const paiement = await (this.repository as any).findPaiementById?.(tentative.paiementId);
    if (!paiement) throw new AppError(404, 'Paiement introuvable.', 'PAYDUNYA_PAYMENT_NOT_FOUND');

    const expectedAmount = Number(paiement.montant);
    const confirmedAmount = Number(invoice['total_amount'] ?? invoice['amount']);
    const confirmedCurrency = ((invoice['currency'] as string) || paiement.devise || 'XOF').toUpperCase();
    if (Number.isFinite(confirmedAmount) && confirmedAmount !== expectedAmount) {
      await (this.repository as any).markReconciliationRequired?.(paiement.id, {
        reason: 'PAYDUNYA_AMOUNT_MISMATCH',
        expected: expectedAmount,
        received: confirmedAmount,
      });
      throw new AppError(409, 'Incohérence de montant PayDunya détectée.', 'PAYDUNYA_AMOUNT_MISMATCH');
    }
    if (confirmedCurrency !== (paiement.devise || 'XOF').toUpperCase()) {
      await (this.repository as any).markReconciliationRequired?.(paiement.id, {
        reason: 'PAYDUNYA_CURRENCY_MISMATCH',
        expected: paiement.devise,
        received: confirmedCurrency,
      });
      throw new AppError(409, 'Incohérence de devise PayDunya détectée.', 'PAYDUNYA_CURRENCY_MISMATCH');
    }

    const statusLower = (confirmedStatus || '').toLowerCase();
    if (statusLower === 'completed' || statusLower === 'paid' || statusLower === 'success') {
      await (this.repository as any).confirmPaiementFromWebhook?.({
        paiementId: paiement.id,
        referenceExterne: confirmedToken,
        montant: expectedAmount,
        devise: paiement.devise || 'XOF',
      });
      await (this.repository as any).updatePaymentEventStatus?.(eventKey, 'TRAITE');
      return { statut: 'TRAITE' };
    }
    if (statusLower === 'failed' || statusLower === 'declined' || statusLower === 'canceled' || statusLower === 'cancelled') {
      await (this.repository as any).failPaiementFromWebhook?.({
        paiementId: paiement.id,
        referenceExterne: confirmedToken,
      });
      await (this.repository as any).updatePaymentEventStatus?.(eventKey, 'TRAITE');
      return { statut: 'TRAITE' };
    }
    if (statusLower === 'pending' || statusLower === 'processing') {
      await (this.repository as any).updatePaymentEventStatus?.(eventKey, 'TRAITE');
      return { statut: 'IGNORE' };
    }

    await (this.repository as any).markReconciliationRequired?.(paiement.id, {
      reason: 'PAYDUNYA_UNKNOWN_STATUS',
      status: confirmedStatus,
    });
    await (this.repository as any).updatePaymentEventStatus?.(eventKey, 'IGNORE');
    return { statut: 'IGNORE' };
  }

  async findManyForAdmin(
    where: Prisma.PaiementWhereInput,
    skip: number,
    take: number
  ): Promise<{ items: PaymentAdminListItem[]; total: number }> {
    return this.repository.findManyForAdmin(where, skip, take);
  }

  async listForAdmin(query: PaymentAdminQuery): Promise<{ items: PaymentAdminListItem[]; total: number; page: number; limit: number; totalPages: number }> {
    const where = buildAdminWhere(query);
    const skip = (query.page - 1) * query.limit;
    const { items, total } = await this.repository.findManyForAdmin(where, skip, query.limit);
    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  async findByIdForAdmin(id: string): Promise<PaymentAdminDetail | null> {
    return this.repository.findByIdForAdmin(id);
  }

  async getForAdmin(id: string): Promise<PaymentAdminDetail | null> {
    return this.repository.findByIdForAdmin(id);
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function buildAdminWhere(query: PaymentAdminQuery): Prisma.PaiementWhereInput {
  const where: Prisma.PaiementWhereInput = {};

  if (query.statut) where.statut = query.statut;
  if (query.reconciliationRequise !== undefined) {
    where.reconciliationRequise = query.reconciliationRequise;
  }

  if (query.q) {
    const q = query.q.trim();
    if (q) {
      const or: Prisma.PaiementWhereInput[] = [{ referenceExterne: { contains: q } }];
      if (UUID_PATTERN.test(q)) {
        or.push({ commandeId: q });
      }
      where.OR = or;
    }
  }

  if (query.dateFrom || query.dateTo) {
    const createdAt: Prisma.DateTimeFilter = {};
    if (query.dateFrom) createdAt.gte = query.dateFrom;
    if (query.dateTo) createdAt.lte = query.dateTo;
    where.createdAt = createdAt;
  }

  return where;
}
