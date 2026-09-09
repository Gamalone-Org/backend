import type { Prisma } from '../../generated/prisma/client.js';

export const reviewListItemSelect = {
  id: true,
  note: true,
  commentaire: true,
  dateAvis: true,
  estVerifie: true,
  commande: {
    select: {
      id: true,
      dateCreation: true,
      statut: true,
      typeCommande: true,
      acheteur: {
        select: {
          id: true,
          user: {
            select: { id: true, nom: true, telephone: true, email: true },
          },
        },
      },
    },
  },
} satisfies Prisma.AvisSelect;

export type ReviewListItem = Prisma.AvisGetPayload<{
  select: typeof reviewListItemSelect;
}>;

export const reviewDetailSelect = {
  id: true,
  note: true,
  commentaire: true,
  dateAvis: true,
  estVerifie: true,
  commande: {
    select: {
      id: true,
      dateCreation: true,
      statut: true,
      typeCommande: true,
      montantTotal: true,
      fraisLivraison: true,
      acheteur: {
        select: {
          id: true,
          user: {
            select: { id: true, nom: true, telephone: true, email: true },
          },
        },
      },
      lignesCommande: {
        select: {
          id: true,
          quantite: true,
          prixUnitaire: true,
          oeuvre: { select: { id: true, titre: true } },
          artisan: { select: { id: true, nomAtelier: true } },
        },
      },
    },
  },
} satisfies Prisma.AvisSelect;

export type ReviewDetail = Prisma.AvisGetPayload<{
  select: typeof reviewDetailSelect;
}>;