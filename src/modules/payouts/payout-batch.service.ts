import { ConflictError, NotFoundError, ValidationError } from '../../common/errors/AppError.js';
import { evaluatePayoutEligibility } from './payout.eligibility.js';
import { isUniqueConstraintError } from './payout.repository.js';
import { PayoutBatchRepository } from './payout-batch.repository.js';
import type { PayoutBatchEligibleRow } from './payout-batch.types.js';
import type {
  PayoutBatchConfirmInput,
  PayoutBatchEligibleQuery,
  PayoutBatchListQuery,
  PayoutBatchPrepareInput,
} from './payout-batch.schema.js';
import type {
  OrderStatus,
  PaymentStatus,
  Prisma,
} from '../../generated/prisma/client.js';

type Decimal = Prisma.Decimal;

function num(value: Decimal | number): number {
  return typeof value === 'number' ? value : Number(value.toString());
}

/**
 * Contraintes de statut/éligibilité du workflow manuel groupé, appliquées en
 * base pour ne charger que les sous-commandes réellement reversables : livrées
 * ou clôturées, paiement confirmé (sans anomalie de réconciliation), réception
 * confirmée par l'acheteur, sans reversement individuel existant et sans
 * réservation active dans un autre reversement groupé.
 */
const ELIGIBLE_COMMANDE_ARTISAN_WHERE: Prisma.CommandeArtisanWhereInput = {
  statut: { in: ['LIVREE', 'CLOTUREE'] },
  payout: null,
  payoutBatchLines: { none: { activeReservationKey: { not: null } } },
  commande: {
    statut: { notIn: ['ANNULEE', 'REMBOURSEE'] },
    paiement: { statut: 'REUSSI', reconciliationRequise: false },
    livraison: { dateReceptionConfirmee: { not: null } },
  },
};

export class PayoutBatchService {
  constructor(private readonly repository: PayoutBatchRepository) {}

  async listForAdmin(query: PayoutBatchListQuery) {
    const where: Prisma.PayoutBatchWhereInput = {};
    if (query.statut) where.statut = query.statut;
    if (query.artisanId) where.artisanId = query.artisanId;
    if (query.dateFrom || query.dateTo) {
      const datePreparation: Prisma.DateTimeFilter = {};
      if (query.dateFrom) datePreparation.gte = query.dateFrom;
      if (query.dateTo) datePreparation.lte = query.dateTo;
      where.datePreparation = datePreparation;
    }

    const skip = (query.page - 1) * query.limit;
    const { items, total } = await this.repository.findManyForAdmin(where, skip, query.limit);
    return {
      batches: items.map((item) => ({
        id: item.id,
        statut: item.statut,
        artisanId: item.artisanId,
        artisan: item.artisan,
        devise: item.devise,
        montantTotal: num(item.montantTotal),
        preparedBy: item.preparedBy,
        confirmedBy: item.confirmedBy,
        datePreparation: item.datePreparation,
        dateConfirmation: item.dateConfirmation,
        dateAnnulation: item.dateAnnulation,
        moyenPaiement: item.moyenPaiement,
        referenceTransfert: item.referenceTransfert,
        lignesCount: item._count.lignes,
        note: item.note,
        motifAnnulation: item.motifAnnulation,
      })),
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  async getForAdmin(id: string) {
    const row = await this.repository.findByIdForAdmin(id);
    if (!row) throw new NotFoundError('Reversement groupé introuvable');
    return {
      id: row.id,
      statut: row.statut,
      artisanId: row.artisanId,
      artisan: row.artisan,
      devise: row.devise,
      montantTotal: num(row.montantTotal),
      preparedBy: row.preparedBy,
      confirmedBy: row.confirmedBy,
      datePreparation: row.datePreparation,
      dateConfirmation: row.dateConfirmation,
      dateAnnulation: row.dateAnnulation,
      moyenPaiement: row.moyenPaiement,
      referenceTransfert: row.referenceTransfert,
      note: row.note,
      motifAnnulation: row.motifAnnulation,
      lignes: row.lignes.map((ligne) => ({
        id: ligne.id,
        montantBrut: num(ligne.montantBrut),
        commission: num(ligne.commission),
        montantNet: num(ligne.montantNet),
        commandeArtisan: {
          id: ligne.commandeArtisan.id,
          statut: ligne.commandeArtisan.statut,
          sousTotal: num(ligne.commandeArtisan.sousTotal),
          commission: num(ligne.commandeArtisan.commission),
          fraisLivraison: num(ligne.commandeArtisan.fraisLivraison),
          montantTotal: num(ligne.commandeArtisan.montantTotal),
          commandeId: ligne.commandeArtisan.commandeId,
          commande: ligne.commandeArtisan.commande,
        },
      })),
      annulations: row.annulations,
    };
  }

  async prepareBatch(data: PayoutBatchPrepareInput, preparedById: string) {
    if (data.commandeArtisanIds.length === 0) {
      throw new ValidationError('Au moins une commande artisan doit être sélectionnée');
    }

    const rows = await this.repository.findCommandeArtisansForBatch(data.commandeArtisanIds);
    if (rows.length !== data.commandeArtisanIds.length) {
      throw new NotFoundError('Une ou plusieurs sous-commandes artisan sont introuvables');
    }

    const artisanId = data.artisanId;
    for (const row of rows) {
      if (row.artisanId !== artisanId) {
        throw new ConflictError('Toutes les commandes sélectionnées doivent appartenir au même artisan');
      }
    }

    const activeLines = await this.repository.findActivePayoutBatchLinesByCommandeArtisanIds(data.commandeArtisanIds);
    for (const line of activeLines) {
      if (line.payoutBatch.statut === 'VERSE') {
        throw new ConflictError('Certaines commandes sélectionnées ont déjà été versées dans un reversement groupé');
      }
      throw new ConflictError('Certaines commandes sélectionnées sont déjà réservées dans un reversement en attente');
    }

    for (const row of rows) {
      if (row.payout) {
        throw new ConflictError('Certaines commandes sélectionnées sont déjà liées à un reversement existant');
      }

      if (!this.evaluateManualEligibility(row).eligible) {
        throw new ConflictError('Certaines commandes sélectionnées ne sont pas éligibles au reversement');
      }
    }

    const lignes = rows.map((row) => {
      const eligibility = this.evaluateManualEligibility(row);
      return {
        commandeArtisanId: row.id,
        montantBrut: eligibility.montantBrut,
        commission: eligibility.commission,
        montantNet: eligibility.montantNet,
      };
    });

    const montantTotal = lignes.reduce((sum, l) => sum + l.montantNet, 0);
    if (!Number.isFinite(montantTotal) || montantTotal <= 0) {
      throw new ValidationError('Le montant total du reversement doit être positif');
    }

    const devise = 'XOF';
    try {
      const result = await this.repository.prepareBatch({
        artisanId,
        preparedById,
        montantTotal,
        devise,
        lignes,
      });
      return { id: result.id };
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictError(
          'Certaines commandes sélectionnées sont déjà réservées par un autre reversement.'
        );
      }
      throw error;
    }
  }

  async confirmBatch(id: string, data: PayoutBatchConfirmInput, confirmedById: string) {
    const batch = await this.repository.findByIdForAdmin(id);
    if (!batch) throw new NotFoundError('Reversement groupé introuvable');
    if (batch.statut !== 'EN_ATTENTE') {
      throw new ConflictError('Seul un reversement en attente peut être confirmé');
    }

    if (data.dateConfirmation) {
      if (data.dateConfirmation > new Date()) {
        throw new ValidationError('La date de confirmation ne peut pas être dans le futur');
      }
    }

    const dateConfirmation = data.dateConfirmation ?? new Date();
    const note = data.note && data.note.length > 0 ? data.note : null;

    const result = await this.repository.confirmBatch({
      id,
      moyenPaiement: data.moyenPaiement,
      referenceTransfert: data.referenceTransfert,
      dateConfirmation,
      note,
      confirmedById,
    });

    if (!result.updated) {
      throw new ConflictError('Ce reversement a déjà été confirmé ou annulé');
    }

    return { id: result.id, statut: result.statut };
  }

  async cancelBatch(id: string, motif: string, annulledById: string) {
    const batch = await this.repository.findByIdForAdmin(id);
    if (!batch) throw new NotFoundError('Reversement groupé introuvable');
    if (batch.statut !== 'EN_ATTENTE') {
      throw new ConflictError('Seul un reversement en attente peut être annulé');
    }

    const result = await this.repository.cancelBatch({
      id,
      motifAnnulation: motif,
      annulledById,
    });

    if (!result.cancelled) {
      throw new ConflictError('Ce reversement a déjà été confirmé ou annulé');
    }

    return { id: result.id };
  }

  /**
   * Liste les sous-commandes artisan éligibles à un reversement manuel groupé,
   * regroupées par artisan. Chaque groupe indique le montant net total qui sera
   * reversé ; chaque commande expose son détail (brut, commission, net) et ses
   * éventuels motifs de blocage. La pagination porte sur les artisans.
   */
  async listEligibleGrouped(query: PayoutBatchEligibleQuery) {
    const where: Prisma.CommandeArtisanWhereInput = { ...ELIGIBLE_COMMANDE_ARTISAN_WHERE };
    if (query.artisanId) where.artisanId = query.artisanId;

    const skip = (query.page - 1) * query.limit;
    const { rows, total } = await this.repository.findEligibleGrouped({
      where,
      skip,
      take: query.limit,
    });

    const parArtisan = new Map<string, PayoutBatchEligibleRow[]>();
    for (const row of rows) {
      const list = parArtisan.get(row.artisanId);
      if (list) list.push(row);
      else parArtisan.set(row.artisanId, [row]);
    }

    const artisans = Array.from(parArtisan.values()).map((groupRows) => {
      const commandes = groupRows.map((row) =>
        this.serializeEligibleCommande(row, this.evaluateManualEligibility(row))
      );
      const { id, nomAtelier, user } = groupRows[0]!.artisan;
      return {
        artisan: { id, nomAtelier, nom: user.nom },
        commandes,
        montantNetTotal: commandes.reduce((sum, commande) => sum + commande.montantNet, 0),
      };
    });

    return {
      artisans,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.max(1, Math.ceil(total / query.limit)),
    };
  }

  private serializeEligibleCommande(
    row: PayoutBatchEligibleRow,
    eligibility: ReturnType<typeof evaluatePayoutEligibility>
  ) {
    return {
      commandeArtisanId: row.id,
      commandeId: row.commandeId,
      statut: row.statut,
      devise: row.commande.paiement?.devise ?? 'XOF',
      montantBrut: num(row.sousTotal),
      commission: num(row.commission),
      montantNet: eligibility.montantNet,
      fraisLivraison: num(row.fraisLivraison),
      montantTotal: num(row.montantTotal),
      dateReceptionConfirmee: eligibility.dateReceptionConfirmee,
      dateEcheance: eligibility.dateEcheance,
      delaiExpire: eligibility.delaiExpire,
      eligible: eligibility.eligible,
      raisons: eligibility.raisons,
    };
  }

  /**
   * Éligibilité du workflow manuel : les statuts et le paiement sont vérifiés
   * sur les valeurs persistées. Le moyen de versement étant choisi par
   * l'administrateur au moment de la confirmation, ni la méthode ni les
   * coordonnées de versement enregistrées ne sont exigées ici.
   */
  private evaluateManualEligibility(row: {
    statut: OrderStatus;
    sousTotal: Decimal | number;
    commission: Decimal | number;
    commande: {
      statut: OrderStatus;
      paiement: { statut: PaymentStatus; reconciliationRequise: boolean } | null;
      livraison: { dateReceptionConfirmee: Date | null } | null;
    };
  }): ReturnType<typeof evaluatePayoutEligibility> {
    return evaluatePayoutEligibility({
      commandeStatut: row.commande.statut,
      commandeArtisanStatut: row.statut,
      paiementStatut: row.commande.paiement?.statut ?? null,
      reconciliationRequise: row.commande.paiement?.reconciliationRequise ?? false,
      dateReceptionConfirmee: row.commande.livraison?.dateReceptionConfirmee ?? null,
      sousTotal: num(row.sousTotal),
      commission: num(row.commission),
      methode: 'MOBILE_MONEY',
      hasMobileMoneyNumero: true,
      hasVirementDetails: false,
    });
  }
}
