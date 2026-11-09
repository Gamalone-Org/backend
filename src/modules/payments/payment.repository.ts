import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import {
  paymentAdminDetailSelect,
  paymentAdminListSelect,
  type PaymentAdminDetail,
  type PaymentAdminListItem,
} from './payment.types.js';

export class PaymentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findOwnedOrder(commandeId: string, userId: string) {
    return this.prisma.commande.findFirst({
      where: { id: commandeId, acheteur: { userId } },
      select: {
        id: true,
        montantTotal: true,
        statut: true,
        paiement: {
          select: {
            id: true,
            montant: true,
            statut: true,
            devise: true,
            prestataire: true,
            referenceExterne: true,
            statutExterne: true,
            urlPaiement: true,
          },
        },
        acheteur: {
          select: {
            id: true,
            fedaPayCustomerId: true,
            user: { select: { nom: true, email: true, telephone: true } },
          },
        },
      },
    });
  }

  async saveCustomerId(buyerProfileId: string, customerId: string) {
    await this.prisma.buyerProfile.update({
      where: { id: buyerProfileId },
      data: { fedaPayCustomerId: customerId },
    });
  }

  /**
   * Réserve l'initialisation du paiement de façon atomique : une seule requête
   * peut passer `EN_ATTENTE`/`ECHOUE` → `EN_COURS` (mise à jour conditionnelle
   * mono-`UPDATE`, donc mono-gagnant). Toute valeur déjà `EN_COURS` ou portant
   * une référence distante est exclue : on ne crée jamais une deuxième
   * transaction FedaPay pour un paiement qui en a peut-être déjà une.
   */
  async claimInitialization(paiementId: string): Promise<boolean> {
    const result = await this.prisma.paiement.updateMany({
      where: {
        id: paiementId,
        urlPaiement: null,
        referenceExterne: null,
        statut: { in: ['EN_ATTENTE', 'ECHOUE'] },
      },
      data: { statut: 'EN_COURS', dateInitialisation: new Date() },
    });
    return result.count === 1;
  }

  /**
   * Annule une réservation lorsque l'initialisation FedaPay a échoué AVANT
   * toute création distante (aucune référence). Si une référence existe déjà,
   * la libération est refusée : la transaction distante ne doit jamais être
   * considérée comme inexistante.
   */
  async releaseInitialization(paiementId: string): Promise<void> {
    await this.prisma.paiement.updateMany({
      where: { id: paiementId, urlPaiement: null, referenceExterne: null, statut: 'EN_COURS' },
      data: { statut: 'EN_ATTENTE' },
    });
  }

  /**
   * Enregistre la référence d'une transaction FedaPay SANS passer par la
   * création d'une tentative. Utilisé en secours lorsque la persistance de la
   * tentative échoue, afin de conserver l'identifiant distant pour la
   * réconciliation et d'empêcher une recréation aveugle.
   */
  async recordRemoteTransaction(data: {
    paiementId: string;
    referenceExterne: string;
    statutExterne: string | null;
    urlPaiement: string | null;
  }): Promise<void> {
    await this.prisma.paiement.update({
      where: { id: data.paiementId },
      data: {
        prestataire: 'FEDAPAY',
        referenceExterne: data.referenceExterne,
        statutExterne: data.statutExterne,
        urlPaiement: data.urlPaiement,
        statut: 'EN_COURS',
      },
    });
  }

  async createAttempt(data: {
    paiementId: string;
    referenceExterne: string;
    statutExterne: string | null;
    montant: number;
    devise: string;
    deviseExterneId?: number | null;
    urlPaiement: string | null;
  }) {
    const deviseExterneId = data.deviseExterneId ?? null;
    return this.prisma.$transaction(async (tx) => {
      const attempt = await tx.paiementTentative.create({
        data: {
          paiementId: data.paiementId,
          prestataire: 'FEDAPAY',
          referenceExterne: data.referenceExterne,
          statut: 'EN_ATTENTE',
          statutExterne: data.statutExterne,
          montant: data.montant,
          devise: data.devise,
          deviseExterneId,
          urlPaiement: data.urlPaiement,
        },
        select: { id: true },
      });

      await tx.paiement.update({
        where: { id: data.paiementId },
        data: {
          prestataire: 'FEDAPAY',
          referenceExterne: data.referenceExterne,
          statutExterne: data.statutExterne,
          urlPaiement: data.urlPaiement,
          devise: data.devise,
          statut: 'EN_COURS',
          dateInitialisation: new Date(),
        },
      });

      return attempt;
    });
  }

  // ---------------------------------------------------------------------------
  // Webhooks FedaPay (Lot 3)
  // ---------------------------------------------------------------------------

  /**
   * Résout le contexte métier d'une transaction externe à partir de sa
   * référence. On cherche d'abord la tentative (elle porte toujours la
   * référence historique), puis on retombe sur le Paiement (chemin de secours
   * `recordRemoteTransaction`) si aucune tentative n'existe.
   */
  async findWebhookContextByReference(referenceExterne: string) {
    const tentative = await this.prisma.paiementTentative.findUnique({
      where: { referenceExterne },
      select: {
        id: true,
        statut: true,
        statutExterne: true,
        referenceExterne: true,
        montant: true,
        devise: true,
        deviseExterneId: true,
        paiementId: true,
        paiement: {
          select: {
            id: true,
            montant: true,
            statut: true,
            devise: true,
            referenceExterne: true,
            commandeId: true,
            commande: {
              select: {
                id: true,
                statut: true,
                lignesCommande: { select: { oeuvreId: true } },
              },
            },
          },
        },
      },
    });

    if (tentative) {
      return { tentative: { ...tentative, paiementId: tentative.paiementId }, paiement: tentative.paiement };
    }

    const paiement = await this.prisma.paiement.findUnique({
      where: { referenceExterne },
      select: {
        id: true,
        montant: true,
        statut: true,
        devise: true,
        referenceExterne: true,
        commandeId: true,
        commande: {
          select: {
            id: true,
            statut: true,
            lignesCommande: { select: { oeuvreId: true } },
          },
        },
      },
    });

    return paiement ? { tentative: null, paiement } : null;
  }

  /**
   * Journalise un événement reçu et tente de le « réclamer » en une seule
   * opération : la contrainte d'unicité sur `referenceEvenement` garantit
   * qu'un même événement livré deux fois n'est traité qu'une fois. Un événement
   * déjà vu n'est repris que s'il avait échoué (voir `claimWebhookEvent`).
   */
  async createWebhookEvent(data: {
    referenceEvenement: string;
    typeEvenement: string;
    referenceTransaction: string | null;
    paiementId: string | null;
  }) {
    try {
      const event = await this.prisma.paiementEvenement.create({
        data: {
          prestataire: 'FEDAPAY',
          referenceEvenement: data.referenceEvenement,
          typeEvenement: data.typeEvenement,
          referenceTransaction: data.referenceTransaction,
          paiementId: data.paiementId,
          statutTraitement: 'EN_TRAITEMENT',
        },
        select: { id: true },
      });
      return { id: event.id, created: true as const, statutTraitement: 'EN_TRAITEMENT' as const };
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      const existing = await this.prisma.paiementEvenement.findUnique({
        where: { referenceEvenement: data.referenceEvenement },
        select: { id: true, statutTraitement: true },
      });
      if (!existing) throw error;
      return { id: existing.id, created: false as const, statutTraitement: existing.statutTraitement };
    }
  }

  /** Reprend un événement précédemment en échec (ECHOUE → EN_TRAITEMENT). */
  async claimWebhookEvent(referenceEvenement: string): Promise<boolean> {
    const result = await this.prisma.paiementEvenement.updateMany({
      where: { referenceEvenement, statutTraitement: 'ECHOUE' },
      data: { statutTraitement: 'EN_TRAITEMENT' },
    });
    return result.count === 1;
  }

  async attachEventToPayment(eventId: string, paiementId: string): Promise<void> {
    await this.prisma.paiementEvenement.updateMany({
      where: { id: eventId, paiementId: null },
      data: { paiementId },
    });
  }

  async finalizeWebhookEvent(
    eventId: string,
    statut: 'TRAITE' | 'IGNORE' | 'ECHOUE',
    erreur?: Record<string, unknown>
  ): Promise<void> {
    await this.prisma.paiementEvenement.update({
      where: { id: eventId },
      data: {
        statutTraitement: statut,
        dateTraitement: new Date(),
        ...(erreur !== undefined ? { erreur: erreur as Prisma.InputJsonValue } : {}),
      },
    });
  }

  /**
   * Applique un paiement approuvé de façon idempotente et sans régression :
   * conditionné sur le statut courant, chaque `updateMany` est un no-op si la
   * ligne a déjà atteint (ou dépassé) l'état cible.
   */
  async applyApprovedPayment(data: {
    paiementId: string;
    tentativeId: string | null;
    commandeId: string;
    oeuvreIds: string[];
    referenceExterne: string;
    statutExterne: string | null;
    dateConfirmation: Date;
    datePaiementEffectif: Date;
  }): Promise<{ reconciliationRequise: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.paiement.updateMany({
        where: { id: data.paiementId, statut: { in: ['EN_ATTENTE', 'EN_COURS', 'ECHOUE'] } },
        data: {
          prestataire: 'FEDAPAY',
          statut: 'REUSSI',
          statutExterne: data.statutExterne,
          referenceExterne: data.referenceExterne,
          dateConfirmation: data.dateConfirmation,
          datePaiementEffectif: data.datePaiementEffectif,
        },
      });

      let reconciliationRequise = false;
      if (data.tentativeId) {
        await tx.paiementTentative.updateMany({
          where: { id: data.tentativeId, statut: { in: ['EN_ATTENTE', 'EN_COURS'] } },
          data: {
            statut: 'REUSSI',
            statutExterne: data.statutExterne,
            dateReussite: data.dateConfirmation,
          },
        });

        // Anomalie de double encaissement : une AUTRE tentative du même paiement
        // est déjà REUSSI (transaction distincte également approuvée). Aucune
        // transition métier n'est rejouée (les updateMany ci-dessus sont déjà
        // idempotents) ; on signale seulement l'anomalie pour réconciliation.
        const autresApprouvees = await tx.paiementTentative.count({
          where: {
            paiementId: data.paiementId,
            statut: 'REUSSI',
            referenceExterne: { not: null },
            id: { not: data.tentativeId },
          },
        });
        if (autresApprouvees > 0) {
          reconciliationRequise = true;
          await tx.paiement.update({
            where: { id: data.paiementId },
            data: { reconciliationRequise: true },
          });
        }
      }

      // La commande et ses sous-commandes ne progressent QUE depuis l'attente
      // de paiement : une commande plus avancée (ou annulée) n'est jamais
      // ramenée en arrière.
      await tx.commande.updateMany({
        where: { id: data.commandeId, statut: 'EN_ATTENTE_PAIEMENT' },
        data: { statut: 'COMMANDE' },
      });

      await tx.commandeArtisan.updateMany({
        where: { commandeId: data.commandeId, statut: 'EN_ATTENTE_PAIEMENT' },
        data: { statut: 'COMMANDE' },
      });

      if (data.oeuvreIds.length > 0) {
        await tx.oeuvre.updateMany({
          where: { id: { in: data.oeuvreIds }, statut: 'EN_PANIER' },
          data: { statut: 'VENDUE' },
        });
      }

      return { reconciliationRequise };
    });
  }

  /**
   * Enregistre un échec (declined / canceled / expired). La commande reste en
   * attente de paiement : aucune annulation automatique, une nouvelle tentative
   * reste possible. La référence active du Paiement est libérée (la tentative
   * conserve l'historique), ce qui autorise la création d'une nouvelle
   * transaction sans conflit d'unicité.
   */
  async applyFailedPayment(data: {
    paiementId: string;
    tentativeId: string | null;
    statutExterne: string | null;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (data.tentativeId) {
        await tx.paiementTentative.updateMany({
          where: { id: data.tentativeId, statut: { in: ['EN_ATTENTE', 'EN_COURS'] } },
          data: { statut: 'ECHOUE', statutExterne: data.statutExterne },
        });
      }

      await tx.paiement.updateMany({
        where: { id: data.paiementId, statut: { in: ['EN_ATTENTE', 'EN_COURS'] } },
        data: {
          statut: 'ECHOUE',
          statutExterne: data.statutExterne,
          referenceExterne: null,
          urlPaiement: null,
        },
      });
    });
  }

  /**
   * Enregistre un remboursement confirmé par FedaPay. Aucune API de
   * remboursement n'est déclenchée ici : on ne fait que refléter l'état réel
   * (paiement remboursé, commande remboursée, œuvres remises au catalogue).
   */
  async applyRefundedPayment(data: {
    paiementId: string;
    tentativeId: string | null;
    commandeId: string;
    oeuvreIds: string[];
    referenceExterne: string;
    statutExterne: string | null;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (data.tentativeId) {
        await tx.paiementTentative.updateMany({
          where: { id: data.tentativeId, statut: { not: 'REMBOURSE' } },
          data: { statut: 'REMBOURSE', statutExterne: data.statutExterne },
        });
      }

      await tx.paiement.updateMany({
        where: { id: data.paiementId, statut: { in: ['EN_COURS', 'REUSSI'] } },
        data: {
          statut: 'REMBOURSE',
          statutExterne: data.statutExterne,
          referenceExterne: data.referenceExterne,
        },
      });

      await tx.commande.updateMany({
        where: {
          id: data.commandeId,
          statut: { in: ['COMMANDE', 'PREPARATION', 'EXPEDIEE', 'LIVREE', 'CLOTUREE'] },
        },
        data: { statut: 'REMBOURSEE' },
      });

      await tx.commandeArtisan.updateMany({
        where: { commandeId: data.commandeId, statut: { notIn: ['ANNULEE', 'REMBOURSEE'] } },
        data: { statut: 'REMBOURSEE' },
      });

      if (data.oeuvreIds.length > 0) {
        await tx.oeuvre.updateMany({
          where: { id: { in: data.oeuvreIds }, statut: { in: ['EN_PANIER', 'VENDUE'] } },
          data: { statut: 'PUBLIEE' },
        });
      }
    });
  }

  /**
   * `transaction.transferred` est purement informatif : il ne doit PAS être
   * confondu avec un reversement artisan ni modifier l'état interne du
   * paiement. On ne met à jour que le statut externe observé.
   */
  async recordTransferred(data: {
    paiementId: string;
    tentativeId: string | null;
    referenceExterne: string;
    statutExterne: string | null;
  }): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      if (data.tentativeId) {
        await tx.paiementTentative.update({
          where: { id: data.tentativeId },
          data: { statutExterne: data.statutExterne },
        });
      }

      await tx.paiement.updateMany({
        where: { id: data.paiementId },
        data: { statutExterne: data.statutExterne, referenceExterne: data.referenceExterne },
      });
    });
  }

  async findManyForAdmin(
    where: Prisma.PaiementWhereInput,
    skip: number,
    take: number
  ): Promise<{ items: PaymentAdminListItem[]; total: number }> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.paiement.findMany({
        where,
        select: paymentAdminListSelect,
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.paiement.count({ where }),
    ]);
    return { items, total };
  }

  findByIdForAdmin(id: string): Promise<PaymentAdminDetail | null> {
    return this.prisma.paiement.findUnique({
      where: { id },
      select: paymentAdminDetailSelect,
    });
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === 'P2002'
  );
}
