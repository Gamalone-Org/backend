import { AppError, ConflictError, NotFoundError, ValidationError } from '../../common/errors/AppError.js';
import { sanitizeDiagnostic } from '../payments/payment.sanitize.js';
import { logPaymentError } from '../payments/payment-logger.js';
import { PayoutRepository } from './payout.repository.js';
import type { PayoutAdminQuery } from './payout.schema.js';
import type {
  CommandeArtisanPayoutRow,
  PayoutAdminDetailRow,
  PayoutAdminListItem,
} from './payout.types.js';
import { evaluatePayoutEligibility, type PayoutEligibilityContext } from './payout.eligibility.js';
import { PrismaClient, Prisma } from '../../generated/prisma/client.js';

type Decimal = Prisma.Decimal;

function num(value: Decimal | number): number {
  return typeof value === 'number' ? value : Number(value.toString());
}

export type PayoutActionResult = {
  payoutId: string;
  statut: string;
  referenceExterne: string | null;
  montantNet: number;
};

export class PayoutService {
  constructor(private readonly repository: PayoutRepository) {}

  async declencherPayout(commandeArtisanId: string, _adminId: string): Promise<PayoutActionResult> {
    const row = await this.repository.findCommandeArtisanForPayout(commandeArtisanId);
    if (!row) throw new NotFoundError('Sous-commande artisan introuvable.');

    const eligibility = this.evaluate(row);
    this.assertEligible(eligibility);

    const existing = await this.repository.findPayoutByCommandeArtisanId(commandeArtisanId);
    let payoutId: string;
    if (existing) {
      if (!(existing.statut === 'EN_ATTENTE')) {
        throw new ConflictError(this.conflictMessage(existing.statut));
      }
      payoutId = existing.id;
    } else {
      try {
        const created = await this.repository.createPayout({
          commandeArtisanId: row.id,
          artisanId: row.artisanId,
          commandeId: row.commandeId,
          montantBrut: eligibility.montantBrut,
          commission: num(row.commission),
          montantNet: eligibility.montantNet,
          devise: this.devise(row),
          methode: row.artisan.paiementPreference!.methode,
        });
        payoutId = created.id;
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('P2002')) {
          throw new ConflictError(
            'Un reversement a déjà été initié pour cette sous-commande artisan.'
          );
        }
        throw error;
      }
    }

    return this.markPayoutEnTraitement(payoutId, row, eligibility);
  }

  async relancerPayout(payoutId: string, _adminId: string): Promise<PayoutActionResult> {
    const payout = await this.repository.findPayoutById(payoutId);
    if (!payout) throw new NotFoundError('Reversement introuvable.');
    if (payout.statut !== 'ECHOUE') {
      throw new ConflictError('Seul un reversement marqué "échoué" peut être relancé.');
    }

    const row = await this.repository.findCommandeArtisanForPayout(payout.commandeArtisanId);
    if (!row) throw new NotFoundError('Sous-commande artisan introuvable.');

    const eligibility = this.evaluate(row);
    this.assertEligible(eligibility);

    return this.markPayoutEnTraitement(payoutId, row, eligibility);
  }

  /**
   * Marque un reversement comme EN_TRAITEMENT en local.
   * Auparavant, cette méthode appelait l'API FedaPay createPayout/startPayout.
   * Désormais, elle ne fait qu'un marquage local à des fins de suivi/admin.
   * Aucun appel réseau vers FedaPay ou PayDunya n'est effectué.
   */
  async markPayoutEnTraitement(
    payoutId: string,
    row: CommandeArtisanPayoutRow,
    eligibility: ReturnType<typeof this.evaluate>
  ): Promise<PayoutActionResult> {
    const maintenant = new Date();
    const devise = this.devise(row);
    const destination = buildPayoutDestinationLocal(
      row.artisan.paiementPreference!,
      row.artisan.user.telephone
    );
    const name = splitNameLocal(row.artisan.user.nom);
    const email = row.artisan.user.email?.trim();
    if (!name || !email) {
      throw new ValidationError("Le nom et l'email de l'artisan sont requis pour le reversement.");
    }

    try {
      await this.repository.markPayoutEnTraitement({
        payoutId,
        referenceExterne: `MANUAL-${payoutId}-${await this.repository.countTentatives(payoutId) + 1}`,
        statutExterne: 'en_traitement',
        modeExterne: destination.mode,
        montant: eligibility.montantNet,
        devise,
        now: maintenant,
      });
    } catch (error) {
      logPaymentError('payout_local_mark_failed', { payoutId, error });
      throw new AppError(
        500,
        'Impossible de marquer le reversement en traitement localement.',
        'PAYOUT_LOCAL_MARK_FAILED'
      );
    }

    return {
      payoutId,
      statut: 'EN_TRAITEMENT',
      referenceExterne: `MANUAL-${payoutId}`,
      montantNet: eligibility.montantNet,
    };
  }

  async markPayoutVerseLocal(payoutId: string, _adminId: string): Promise<void> {
    const payout = await this.repository.findPayoutById(payoutId);
    if (!payout) throw new NotFoundError('Reversement introuvable.');

    const maintenant = new Date();
    await this.repository.markPayoutVerseLocal(payoutId, maintenant);
  }

  async markPayoutEchoueLocal(payoutId: string, motif: string, _adminId: string): Promise<void> {
    const payout = await this.repository.findPayoutById(payoutId);
    if (!payout) throw new NotFoundError('Reversement introuvable.');

    const maintenant = new Date();
    await this.repository.markPayoutEchoueLocal(payoutId, motif, maintenant);
  }

  /**
   * Synchronisation locale pour les anciens reversements FedaPay historiques.
   * N'INITIE JAMAIN de nouvelle transaction : elle ne fait que mettre à jour
   * le statut local en se basant sur la référence externe existante.
   * Les reversements sans référence prestataire (manuels) sont refusés.
   */
  async synchroniserPayout(payoutId: string): Promise<{ id: string; statut: string; statutExterne: string | null }> {
    const payout = await this.repository.findPayoutById(payoutId);
    if (!payout) throw new NotFoundError('Reversement introuvable.');

    // Si le reversement n'a pas de référence prestataire, c'est un reversement manuel
    // et il n'y a pas d'API externe à consulter.
    if (!payout.referenceExterne) {
      // Marquer comme traité localement s'il était en attente
      const maintenant = new Date();
      await this.repository.markPayoutVerseLocal(payoutId, maintenant);
      return { id: payout.id, statut: 'VERSE', statutExterne: null };
    }

    // Pour les anciens reversements FedaPay avec référence, on peut essayer de
    // consulter l'API distante mais en l'échec comme best-effort seulement.
    // Ici, on refuse toute tentative d'appel externe et on se base sur le statut local.
    throw new ConflictError(
      'La synchronisation des anciens reversements FedaPay nécessite une référence externe valide et un accès à l\'API distante, qui est désormais désactivé.'
    );
  }

  // ---------------------------------------------------------------------------
  // Lecture back-office
  // ---------------------------------------------------------------------------

  async listForAdmin(query: PayoutAdminQuery) {
    const where = this.buildPayoutAdminWhere(query);
    const skip = (query.page - 1) * query.limit;
    const { items, total } = await this.repository.findManyForAdmin(where, skip, query.limit);
    return {
      reversements: items.map((item) => this.serializeList(item)),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  async getForAdmin(id: string) {
    const row = await this.repository.findByIdForAdmin(id);
    if (!row) throw new NotFoundError('Reversement introuvable');
    return this.serializeDetail(row);
  }

  /**
   * Liste les sous-commandes artisan éligibles à un reversement, avec le détail
   * de leur éligibilité (montant net, échéance indicative). La pagination porte
   * sur le périmètre interrogé en base ; chaque élément indique s'il est
   * réellement déclenchable à l'instant T.
   */
  async listAEfectuer(query: PayoutAdminQuery) {
    const where: Prisma.CommandeArtisanWhereInput = {
      statut: { in: ['LIVREE', 'CLOTUREE'] },
      payout: null,
      commande: {
        statut: { notIn: ['ANNULEE', 'REMBOURSEE'] },
        paiement: { statut: 'REUSSI', reconciliationRequise: false },
        livraison: { dateReceptionConfirmee: { not: null } },
      },
      artisan: { paiementPreference: { isNot: null } },
    };
    const skip = (query.page - 1) * query.limit;
    const { items, total } = await this.repository.findEligibleCommandeArtisans(
      where,
      skip,
      query.limit
    );
    return {
      commandesArtisans: items.map((row) => {
        const eligibility = this.evaluate(row);
        return {
          commandeArtisanId: row.id,
          commandeId: row.commandeId,
          artisan: {
            id: row.artisan.id,
            nomAtelier: row.artisan.nomAtelier,
            nom: row.artisan.user.nom,
          },
          devise: this.devise(row),
          montantBrut: num(row.sousTotal),
          commission: num(row.commission),
          montantNet: eligibility.montantNet,
          dateReceptionConfirmee: eligibility.dateReceptionConfirmee,
          dateEcheance: eligibility.dateEcheance,
          delaiExpire: eligibility.delaiExpire,
          eligible: eligibility.eligible,
          raisons: eligibility.raisons,
        };
      }),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private evaluate(row: CommandeArtisanPayoutRow) {
    const pref = row.artisan.paiementPreference;
    const context: PayoutEligibilityContext = {
      commandeStatut: row.commande.statut,
      commandeArtisanStatut: row.statut,
      paiementStatut: row.commande.paiement?.statut ?? null,
      reconciliationRequise: row.commande.paiement?.reconciliationRequise ?? false,
      dateReceptionConfirmee: row.commande.livraison?.dateReceptionConfirmee ?? null,
      sousTotal: num(row.sousTotal),
      commission: num(row.commission),
      methode: pref?.methode ?? null,
      hasMobileMoneyNumero: Boolean(pref?.mobileMoneyNumero?.trim()),
      hasVirementDetails: Boolean(pref?.virementIban?.trim() || pref?.virementNomCompte?.trim()),
    };
    return evaluatePayoutEligibility(context);
  }

  private buildPayoutAdminWhere(query: PayoutAdminQuery): Prisma.PayoutWhereInput {
    const where: Prisma.PayoutWhereInput = {};

    if (query.statut) where.statut = query.statut;

    if (query.q) {
      const q = query.q.trim();
      if (q) {
        const or: Prisma.PayoutWhereInput[] = [{ referenceExterne: { contains: q } }];
        const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (UUID_PATTERN.test(q)) {
          or.push({ commandeId: q });
          or.push({ commandeArtisanId: q });
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

  private assertEligible(eligibility: ReturnType<typeof this.evaluate>): void {
    if (eligibility.eligible) return;
    throw new ConflictError(`Reversement impossible : détails d'éligibilité non satisfaits.`);
  }

  private devise(row: CommandeArtisanPayoutRow): string {
    return row.commande.paiement?.devise?.trim().toUpperCase() ?? 'XOF';
  }

  private conflictMessage(statut: string): string {
    switch (statut) {
      case 'EN_TRAITEMENT':
        return 'Un reversement est déjà en cours pour cette sous-commande.';
      case 'VERSE':
        return 'Cette sous-commande a déjà été reversée.';
      case 'RECONCILIATION_REQUISE':
        return 'Le reversement précédent est en réconciliation manuelle.';
      case 'ECHOUE':
        return 'Le reversement précédent a échoué : utilisez la relance.';
      default:
        return 'Un reversement a déjà été initié pour cette sous-commande.';
    }
  }

  private serializeList(item: PayoutAdminListItem) {
    return {
      id: item.id,
      statut: item.statut,
      statutExterne: item.statutExterne,
      methode: item.methode,
      modeExterne: item.modeExterne,
      montantBrut: num(item.montantBrut),
      commission: num(item.commission),
      montantNet: num(item.montantNet),
      devise: item.devise,
      prestataire: item.prestataire,
      referenceExterne: item.referenceExterne,
      dateCreation: item.dateCreation,
      dateDeclenchement: item.dateDeclenchement,
      dateConfirmation: item.dateConfirmation,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
      tentatives: item._count.tentatives,
      artisan: {
        id: item.artisan.id,
        nomAtelier: item.artisan.nomAtelier,
        nom: item.artisan.user.nom,
      },
      commande: {
        id: item.commande.id,
        statut: item.commande.statut,
        dateCreation: item.commande.dateCreation,
      },
      commandeArtisan: {
        id: item.commandeArtisan.id,
        statut: item.commandeArtisan.statut,
      },
    };
  }

  private serializeDetail(row: PayoutAdminDetailRow) {
    const pref = row.artisan.paiementPreference;
    const destinationMasquee = pref
      ? this.buildPayoutDestinationMasquee(pref, row.artisan.user.telephone)
      : null;

    return {
      id: row.id,
      statut: row.statut,
      statutExterne: row.statutExterne,
      methode: row.methode,
      modeExterne: row.modeExterne,
      montantBrut: num(row.montantBrut),
      commission: num(row.commission),
      montantNet: num(row.montantNet),
      devise: row.devise,
      prestataire: row.prestataire,
      referenceExterne: row.referenceExterne,
      dateCreation: row.dateCreation,
      dateDeclenchement: row.dateDeclenchement,
      dateConfirmation: row.dateConfirmation,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      erreur: row.erreur === null ? null : (sanitizeDiagnostic(row.erreur) as Prisma.JsonValue),
      destinationMasquee,
      artisan: {
        id: row.artisan.id,
        nomAtelier: row.artisan.nomAtelier,
        nom: row.artisan.user.nom,
      },
      commandeArtisan: {
        id: row.commandeArtisan.id,
        statut: row.commandeArtisan.statut,
        sousTotal: num(row.commandeArtisan.sousTotal),
        commission: num(row.commandeArtisan.commission),
        fraisLivraison: num(row.commandeArtisan.fraisLivraison),
        montantTotal: num(row.commandeArtisan.montantTotal),
      },
      commande: {
        id: row.commande.id,
        statut: row.commande.statut,
        dateCreation: row.commande.dateCreation,
        montantTotal: num(row.commande.montantTotal),
        paiement: row.commande.paiement
          ? {
              statut: row.commande.paiement.statut,
              reconciliationRequise: row.commande.paiement.reconciliationRequise,
              devise: row.commande.paiement.devise,
            }
          : null,
        livraison: row.commande.livraison
          ? {
              statut: row.commande.livraison.statut,
              dateReceptionConfirmee: row.commande.livraison.dateReceptionConfirmee,
            }
          : null,
      },
      tentatives: row.tentatives.map((tentative) => ({
        id: tentative.id,
        prestataire: tentative.prestataire,
        referenceExterne: tentative.referenceExterne,
        statut: tentative.statut,
        statutExterne: tentative.statutExterne,
        montant: num(tentative.montant),
        devise: tentative.devise,
        modeExterne: tentative.modeExterne,
        dateCreation: tentative.dateCreation,
        dateEnvoi: tentative.dateEnvoi,
        dateReussite: tentative.dateReussite,
        erreur:
          tentative.erreur === null
            ? null
            : (sanitizeDiagnostic(tentative.erreur) as Prisma.JsonValue),
      })),
    };
  }

  private buildPayoutDestinationMasquee(pref: { methode: string; mobileMoneyNumero?: string | null; virementIban?: string | null; virementNomCompte?: string | null } | null, _telephone: string | null | undefined) {
    // Version masquée ne révélant pas les coordonnées complètes
    if (!pref) return null;
    if (pref.methode === 'MOBILE_MONEY' && pref.mobileMoneyNumero) {
      const lastDigits = pref.mobileMoneyNumero.slice(-4);
      return { masquee: `*****${lastDigits}` };
    }
    if (pref.methode === 'VIREMENT_BANCAIRE') {
      if (pref.virementIban) {
        const lastDigits = pref.virementIban.slice(-4);
        return { masquee: `**** **** **** ${lastDigits}` };
      }
      if (pref.virementNomCompte) {
        return { masquee: `Virement vers ${pref.virementNomCompte}` };
      }
    }
    return null;
  }
}

function buildPayoutDestinationLocal(
  pref: { methode: string; mobileMoneyNumero?: string | null; virementIban?: string | null; virementNomCompte?: string | null } | null,
  _telephone: string | null | undefined
) {
  // Version allégée sans appel API externe
  return { mode: pref?.methode === 'VIREMENT_BANCAIRE' ? 'virement' : 'mobile_money' };
}

function splitNameLocal(nom: string | null | undefined) {
  if (!nom) return { firstname: '', lastname: '' };
  const parts = nom.trim().split(' ');
  return {
    firstname: parts[0] || '',
    lastname: parts.slice(1).join(' ') || '',
  };
}

// Export helper for repository
export async function markPayoutEnTraitementLocal(
  prisma: PrismaClient,
  payoutId: string,
  referenceExterne: string,
  statutExterne: string | null,
  modeExterne: string | null,
  montant: number,
  devise: string,
  now: Date
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.payout.update({
      where: { id: payoutId },
      data: {
        statut: 'EN_TRAITEMENT',
        referenceExterne,
        statutExterne,
        modeExterne,
        dateDeclenchement: now,
        erreur: Prisma.JsonNull,
      },
    });
    await tx.payoutTentative.create({
      data: {
        payoutId,
        prestataire: 'FEDAPAY',
        referenceExterne,
        statut: 'EN_TRAITEMENT',
        statutExterne,
        montant,
        devise,
        modeExterne,
        dateEnvoi: now,
      },
    });
  });
}

// Export helper for repository
export async function markPayoutVerseLocal(
  prisma: PrismaClient,
  payoutId: string,
  now: Date
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.payout.update({
      where: { id: payoutId },
      data: {
        statut: 'VERSE',
        dateConfirmation: now,
      },
    });
    await tx.payoutTentative.updateMany({
      where: {
        payoutId: payoutId,
        statut: { in: ['EN_ATTENTE', 'EN_TRAITEMENT', 'RECONCILIATION_REQUISE'] },
      },
      data: { statut: 'VERSE', statutExterne: null, dateReussite: now },
    });
  });
}

// Export helper for repository
export async function markPayoutEchoueLocal(
  prisma: PrismaClient,
  payoutId: string,
  motif: string,
  _now: Date
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.payout.update({
      where: { id: payoutId },
      data: {
        statut: 'ECHOUE',
        erreur: { motif },
      },
    });
    await tx.payoutTentative.create({
      data: {
        payoutId,
        prestataire: 'FEDAPAY',
        statut: 'ECHOUE',
        montant: 0,
        devise: 'XOF',
        erreur: { motif },
      },
    });
  });
}