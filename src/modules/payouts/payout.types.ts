import type { Prisma } from '../../generated/prisma/client.js';

/**
 * Sélection de la liste des reversements (back-office). Aucune coordonnée
 * bénéficiaire brute (numéro Mobile Money, IBAN) n'est sélectionnée : seul le
 * masque est calculé côté service à partir d'une sélection dédiée.
 */
export const payoutAdminListSelect = {
  id: true,
  statut: true,
  statutExterne: true,
  methode: true,
  modeExterne: true,
  montantBrut: true,
  commission: true,
  montantNet: true,
  devise: true,
  prestataire: true,
  referenceExterne: true,
  dateCreation: true,
  dateDeclenchement: true,
  dateConfirmation: true,
  createdAt: true,
  updatedAt: true,
  artisan: {
    select: {
      id: true,
      nomAtelier: true,
      user: { select: { nom: true } },
    },
  },
  commandeArtisan: {
    select: {
      id: true,
      statut: true,
      commandeId: true,
    },
  },
  commande: {
    select: {
      id: true,
      statut: true,
      dateCreation: true,
    },
  },
  _count: { select: { tentatives: true } },
} satisfies Prisma.PayoutSelect;

export type PayoutAdminListItem = Prisma.PayoutGetPayload<{
  select: typeof payoutAdminListSelect;
}>;

/**
 * Sélection du détail d'un reversement : historique des tentatives et contexte
 * (artisan, sous-commande, commande, paiement, livraison). La préférence de
 * versement brute est chargée uniquement pour produire un masque ; elle n'est
 * jamais renvoyée telle quelle (voir `serializePayoutAdminDetail`).
 */
export const payoutAdminDetailSelect = {
  ...payoutAdminListSelect,
  erreur: true,
  tentatives: {
    orderBy: { dateCreation: 'desc' },
    select: {
      id: true,
      prestataire: true,
      referenceExterne: true,
      statut: true,
      statutExterne: true,
      montant: true,
      devise: true,
      modeExterne: true,
      dateCreation: true,
      dateEnvoi: true,
      dateReussite: true,
      erreur: true,
    },
  },
  artisan: {
    select: {
      id: true,
      nomAtelier: true,
      commission: true,
      user: { select: { nom: true, email: true, telephone: true } },
      paiementPreference: true,
    },
  },
  commandeArtisan: {
    select: {
      id: true,
      statut: true,
      commandeId: true,
      sousTotal: true,
      commission: true,
      fraisLivraison: true,
      montantTotal: true,
    },
  },
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
} satisfies Prisma.PayoutSelect;

export type PayoutAdminDetailRow = Prisma.PayoutGetPayload<{
  select: typeof payoutAdminDetailSelect;
}>;

/**
 * Sélection de la sous-commande artisan servant à évaluer l'éligibilité d'un
 * reversement et à construire la destination (préférence incluse).
 */
export const commandeArtisanPayoutSelect = {
  id: true,
  statut: true,
  artisanId: true,
  commandeId: true,
  sousTotal: true,
  commission: true,
  fraisLivraison: true,
  montantTotal: true,
  commande: {
    select: {
      id: true,
      statut: true,
      paiement: { select: { statut: true, reconciliationRequise: true, devise: true } },
      livraison: { select: { dateReceptionConfirmee: true } },
    },
  },
  artisan: {
    select: {
      id: true,
      nomAtelier: true,
      commission: true,
      user: { select: { nom: true, email: true, telephone: true } },
      paiementPreference: true,
    },
  },
  payout: {
    select: { id: true, statut: true },
  },
} satisfies Prisma.CommandeArtisanSelect;

export type CommandeArtisanPayoutRow = Prisma.CommandeArtisanGetPayload<{
  select: typeof commandeArtisanPayoutSelect;
}>;
