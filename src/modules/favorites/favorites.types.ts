import type { Prisma } from '../../generated/prisma/client.js';

// Sélection pour la liste « Mes favoris » de l'acheteur : les informations
// nécessaires à l'affichage de la carte œuvre. La couverture est la première
// image de type OEUVRE (ordre croissant), convention du module marketplace.
// Aucune donnée sensible n'est exposée (pas d'email, téléphone, KYC, token).
export const favoriListSelect = {
  id: true,
  dateCreation: true,
  oeuvre: {
    select: {
      id: true,
      titre: true,
      prixXOF: true,
      statut: true,
      disponibilite: true,
      artisan: {
        select: {
          id: true,
          nomAtelier: true,
          user: { select: { nom: true } },
        },
      },
      medias: {
        where: { type: 'OEUVRE' },
        orderBy: { ordre: 'asc' },
        take: 1,
        select: { id: true, url: true },
      },
    },
  },
} satisfies Prisma.FavoriSelect;

export type FavoriListResult = Prisma.FavoriGetPayload<{
  select: typeof favoriListSelect;
}>;