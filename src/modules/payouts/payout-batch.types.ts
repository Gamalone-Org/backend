import type { Prisma } from '../../generated/prisma/client.js';

export const payoutBatchListSelect = {
  id: true,
  artisanId: true,
  devise: true,
  montantTotal: true,
  statut: true,
  preparedById: true,
  confirmedById: true,
  datePreparation: true,
  dateConfirmation: true,
  dateAnnulation: true,
  moyenPaiement: true,
  referenceTransfert: true,
  note: true,
  motifAnnulation: true,
  createdAt: true,
  updatedAt: true,
  artisan: {
    select: {
      id: true,
      nomAtelier: true,
      user: { select: { nom: true } },
    },
  },
  preparedBy: {
    select: {
      id: true,
      user: { select: { nom: true, email: true } },
      niveauAcces: true,
    },
  },
  confirmedBy: {
    select: {
      id: true,
      user: { select: { nom: true, email: true } },
      niveauAcces: true,
    },
  },
  _count: { select: { lignes: true } },
} satisfies Prisma.PayoutBatchSelect;

export type PayoutBatchListItem = Prisma.PayoutBatchGetPayload<{
  select: typeof payoutBatchListSelect;
}>;

export const payoutBatchDetailSelect = {
  ...payoutBatchListSelect,
  lignes: {
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      montantBrut: true,
      commission: true,
      montantNet: true,
      commandeArtisan: {
        select: {
          id: true,
          statut: true,
          sousTotal: true,
          commission: true,
          fraisLivraison: true,
          montantTotal: true,
          commandeId: true,
          commande: {
            select: {
              id: true,
              statut: true,
              dateCreation: true,
              montantTotal: true,
              paiement: {
                select: { statut: true, reconciliationRequise: true, devise: true },
              },
              livraison: {
                select: { statut: true, dateReceptionConfirmee: true },
              },
            },
          },
        },
      },
    },
  },
  annulations: {
    orderBy: { dateAnnulation: 'desc' },
    select: {
      id: true,
      motif: true,
      dateAnnulation: true,
      annulledBy: {
        select: {
          id: true,
          user: { select: { nom: true, email: true } },
          niveauAcces: true,
        },
      },
    },
  },
} satisfies Prisma.PayoutBatchSelect;

export type PayoutBatchDetailRow = Prisma.PayoutBatchGetPayload<{
  select: typeof payoutBatchDetailSelect;
}>;

/**
 * Sélection d'une sous-commande artisan éligible à un reversement manuel.
 * Aucune coordonnée de versement n'est sélectionnée : le workflow manuel ne
 * dépend pas de la préférence de paiement (le moyen est choisi au moment de la
 * confirmation par l'administrateur).
 */
export const payoutBatchEligibleSelect = {
  id: true,
  statut: true,
  artisanId: true,
  commandeId: true,
  sousTotal: true,
  commission: true,
  fraisLivraison: true,
  montantTotal: true,
  updatedAt: true,
  commande: {
    select: {
      id: true,
      statut: true,
      dateCreation: true,
      paiement: { select: { statut: true, reconciliationRequise: true, devise: true } },
      livraison: { select: { statut: true, dateReceptionConfirmee: true } },
    },
  },
  artisan: {
    select: {
      id: true,
      nomAtelier: true,
      user: { select: { nom: true } },
    },
  },
} satisfies Prisma.CommandeArtisanSelect;

export type PayoutBatchEligibleRow = Prisma.CommandeArtisanGetPayload<{
  select: typeof payoutBatchEligibleSelect;
}>;
