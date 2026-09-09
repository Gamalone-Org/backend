import type { Prisma } from '../../generated/prisma/client.js';

export const disputeListItemSelect = {
  id: true,
  motif: true,
  statut: true,
  createdAt: true,
  updatedAt: true,
  commande: {
    select: {
      id: true,
      dateCreation: true,
      statut: true,
      typeCommande: true,
      montantTotal: true,
      acheteur: {
        select: {
          id: true,
          user: { select: { id: true, nom: true, telephone: true, email: true } },
        },
      },
    },
  },
  artisan: {
    select: {
      id: true,
      nomAtelier: true,
      user: { select: { id: true, nom: true, telephone: true, email: true } },
    },
  },
} satisfies Prisma.LitigeSelect;

export type DisputeListItem = Prisma.LitigeGetPayload<{
  select: typeof disputeListItemSelect;
}>;

export const disputeDetailSelect = {
  id: true,
  motif: true,
  statut: true,
  createdAt: true,
  updatedAt: true,
  commande: {
    select: {
      id: true,
      dateCreation: true,
      statut: true,
      typeCommande: true,
      montantTotal: true,
      commission: true,
      fraisLivraison: true,
      acheteur: {
        select: {
          id: true,
          adresseLivraison: true,
          user: { select: { id: true, nom: true, telephone: true, email: true } },
        },
      },
      paiement: {
        select: {
          id: true,
          montant: true,
          methode: true,
          statut: true,
          date: true,
          estEnsequestre: true,
        },
      },
      livraison: {
        select: {
          id: true,
          transporteur: true,
          numeroSuivi: true,
          statut: true,
          adresseDest: true,
          frais: true,
        },
      },
      lignesCommande: {
        select: {
          id: true,
          quantite: true,
          prixUnitaire: true,
          artisanId: true,
          oeuvre: { select: { id: true, titre: true } },
        },
      },
      commandesArtisans: {
        select: {
          id: true,
          artisanId: true,
          statut: true,
          montantTotal: true,
        },
      },
    },
  },
  artisan: {
    select: {
      id: true,
      nomAtelier: true,
      localisation: true,
      estCertifie: true,
      user: { select: { id: true, nom: true, telephone: true, email: true } },
    },
  },
} satisfies Prisma.LitigeSelect;

export type DisputeDetail = Prisma.LitigeGetPayload<{
  select: typeof disputeDetailSelect;
}>;