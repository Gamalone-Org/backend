import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import {
  payoutBatchDetailSelect,
  payoutBatchEligibleSelect,
  payoutBatchListSelect,
} from './payout-batch.types.js';
import type {
  PayoutBatchDetailRow,
  PayoutBatchEligibleRow,
  PayoutBatchListItem,
} from './payout-batch.types.js';

export class PayoutBatchRepository {
  constructor(private readonly prisma: PrismaClient) {}

  findCommandeArtisansForBatch(commandeArtisanIds: string[]) {
    return this.prisma.commandeArtisan.findMany({
      where: { id: { in: commandeArtisanIds } },
      select: {
        id: true,
        artisanId: true,
        statut: true,
        sousTotal: true,
        commission: true,
        fraisLivraison: true,
        montantTotal: true,
        commande: {
          select: {
            id: true,
            statut: true,
            paiement: { select: { statut: true, reconciliationRequise: true } },
            livraison: { select: { dateReceptionConfirmee: true } },
          },
        },
        artisan: { select: { id: true, nomAtelier: true } },
        payout: { select: { id: true } },
        payoutBatchLines: {
          where: { activeReservationKey: { not: null } },
          select: { id: true, payoutBatchId: true },
        },
      },
    });
  }

  /** Réservations actives (batch EN_ATTENTE ou VERSE) pour ces commandes. */
  findActivePayoutBatchLinesByCommandeArtisanIds(commandeArtisanIds: string[]) {
    return this.prisma.payoutBatchLine.findMany({
      where: {
        commandeArtisanId: { in: commandeArtisanIds },
        activeReservationKey: { not: null },
      },
      include: { payoutBatch: { select: { id: true, statut: true } } },
    });
  }

  /**
   * Sous-commandes artisan éligibles à un reversement manuel, regroupées par
   * artisan. La pagination porte sur les artisans (groupes) : on liste d'abord
   * les artisans ayant au moins une commande éligible, puis on charge leurs
   * commandes éligibles. Aucune coordonnée de versement n'est sélectionnée.
   */
  async findEligibleGrouped(params: {
    where: Prisma.CommandeArtisanWhereInput;
    skip: number;
    take: number;
  }): Promise<{
    groups: Array<{ artisanId: string; count: number }>;
    rows: PayoutBatchEligibleRow[];
    total: number;
  }> {
    const grouped = await this.prisma.commandeArtisan.groupBy({
      by: ['artisanId'],
      where: params.where,
      _count: { _all: true },
      orderBy: { artisanId: 'asc' },
    });

    const total = grouped.length;
    const pageGroups = grouped.slice(params.skip, params.skip + params.take);
    const artisanIds = pageGroups.map((group) => group.artisanId);

    const rows = artisanIds.length
      ? await this.prisma.commandeArtisan.findMany({
          where: { ...params.where, artisanId: { in: artisanIds } },
          select: payoutBatchEligibleSelect,
          orderBy: [{ artisanId: 'asc' }, { updatedAt: 'desc' }],
        })
      : [];

    return {
      groups: pageGroups.map((group) => ({
        artisanId: group.artisanId,
        count: group._count._all,
      })),
      rows,
      total,
    };
  }

  async findManyForAdmin(
    where: Prisma.PayoutBatchWhereInput,
    skip: number,
    take: number
  ): Promise<{ items: PayoutBatchListItem[]; total: number }> {
    const [items, total] = await this.prisma.$transaction([
      this.prisma.payoutBatch.findMany({
        where,
        select: payoutBatchListSelect,
        orderBy: { datePreparation: 'desc' },
        skip,
        take,
      }),
      this.prisma.payoutBatch.count({ where }),
    ]);
    return { items, total };
  }

  findByIdForAdmin(id: string): Promise<PayoutBatchDetailRow | null> {
    return this.prisma.payoutBatch.findUnique({
      where: { id },
      select: payoutBatchDetailSelect,
    });
  }

  async prepareBatch(params: {
    artisanId: string;
    preparedById: string;
    montantTotal: number;
    devise: string;
    lignes: Array<{
      commandeArtisanId: string;
      montantBrut: number;
      commission: number;
      montantNet: number;
    }>;
  }) {
    return this.prisma.$transaction(async (tx) => {
      const batch = await tx.payoutBatch.create({
        data: {
          artisanId: params.artisanId,
          preparedById: params.preparedById,
          montantTotal: params.montantTotal,
          devise: params.devise,
          statut: 'EN_ATTENTE',
        },
        select: { id: true },
      });

      await tx.payoutBatchLine.createMany({
        data: params.lignes.map((l) => ({
          payoutBatchId: batch.id,
          commandeArtisanId: l.commandeArtisanId,
          activeReservationKey: l.commandeArtisanId,
          montantBrut: l.montantBrut,
          commission: l.commission,
          montantNet: l.montantNet,
        })),
      });

      return batch;
    });
  }

  /**
   * Confirme le reversement de façon atomique. La condition `statut =
   * EN_ATTENTE` dans le `WHERE` garantit qu'un double appel concurrent ne peut
   * pas confirmer deux fois : la seconde transaction ne met à jour aucune ligne
   * (`updated = false`).
   */
  async confirmBatch(params: {
    id: string;
    moyenPaiement: 'MOBILE_MONEY' | 'VIREMENT_BANCAIRE';
    referenceTransfert: string;
    dateConfirmation: Date;
    note: string | null;
    confirmedById: string;
  }): Promise<{ id: string; statut: 'VERSE'; updated: boolean }> {
    const result = await this.prisma.payoutBatch.updateMany({
      where: { id: params.id, statut: 'EN_ATTENTE' },
      data: {
        statut: 'VERSE',
        moyenPaiement: params.moyenPaiement,
        referenceTransfert: params.referenceTransfert,
        dateConfirmation: params.dateConfirmation,
        note: params.note,
        confirmedById: params.confirmedById,
      },
    });
    return { id: params.id, statut: 'VERSE', updated: result.count === 1 };
  }

  /**
   * Annule la préparation de façon atomique. Comme la confirmation, l'annulation
   * n'agit que sur un batch `EN_ATTENTE` : un second appel concurrent ne libère
   * pas deux fois ni ne duplique l'historique.
   */
  async cancelBatch(params: {
    id: string;
    motifAnnulation: string;
    annulledById: string;
  }): Promise<{ id: string; cancelled: boolean }> {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.payoutBatch.updateMany({
        where: { id: params.id, statut: 'EN_ATTENTE' },
        data: {
          statut: 'ANNULE',
          motifAnnulation: params.motifAnnulation,
          dateAnnulation: new Date(),
        },
      });

      if (result.count === 0) {
        return { id: params.id, cancelled: false };
      }

      await tx.payoutBatchAnnulation.create({
        data: {
          payoutBatchId: params.id,
          annulledById: params.annulledById,
          motif: params.motifAnnulation,
        },
      });

      // Libère les commandes réservées : elles redeviennent réaffectables tout en
      // conservant la ligne historique du batch annulé.
      await tx.payoutBatchLine.updateMany({
        where: { payoutBatchId: params.id },
        data: { activeReservationKey: null },
      });

      return { id: params.id, cancelled: true };
    });
  }
}
