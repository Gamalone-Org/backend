import type { Prisma } from '../../generated/prisma/client.js';

export const deliveryListItemSelect = {
  id: true,
  transporteur: true,
  numeroSuivi: true,
  statut: true,
  adresseDest: true,
  frais: true,
  commande: {
    select: {
      id: true,
      dateCreation: true,
      statut: true,
    },
  },
} satisfies Prisma.LivraisonSelect;

export type DeliveryListItem = Prisma.LivraisonGetPayload<{
  select: typeof deliveryListItemSelect;
}>;

export const deliveryDetailSelect = {
  id: true,
  transporteur: true,
  numeroSuivi: true,
  statut: true,
  adresseDest: true,
  frais: true,
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
          adresseLivraison: true,
          user: {
            select: { id: true, nom: true, telephone: true, email: true },
          },
        },
      },
    },
  },
} satisfies Prisma.LivraisonSelect;

export type DeliveryDetail = Prisma.LivraisonGetPayload<{
  select: typeof deliveryDetailSelect;
}>;