import type { OrderStatus, Prisma } from '../../generated/prisma/client.js';

export type AcheteurCommandeFilters = {
  statuts?: OrderStatus[];
  q?: string;
  tri?: string;
};

export const commandeDetailedSelect = {
  id: true,
  dateCreation: true,
  statut: true,
  typeCommande: true,
  montantTotal: true,
  commission: true,
  fraisLivraison: true,
  createdAt: true,
  updatedAt: true,
  acheteur: {
    select: {
      id: true,
      adresseLivraison: true,
      devise: true,
      langue: true,
      typeClient: true,
      user: {
        select: { id: true, nom: true, telephone: true, email: true },
      },
    },
  },
  lignesCommande: {
    select: {
      id: true,
      prixUnitaire: true,
      quantite: true,
      commandeArtisanId: true,
      oeuvre: {
        select: {
          id: true,
          titre: true,
          categorie: { select: { id: true, nom: true } },
        },
      },
      artisan: {
        select: {
          id: true,
          nomAtelier: true,
          user: { select: { id: true, nom: true } },
        },
      },
    },
  },
  commandesArtisans: {
    select: {
      id: true,
      statut: true,
      sousTotal: true,
      commission: true,
      fraisLivraison: true,
      montantTotal: true,
      createdAt: true,
      updatedAt: true,
      artisan: {
        select: {
          id: true,
          nomAtelier: true,
          user: { select: { id: true, nom: true } },
        },
      },
      lignesCommande: {
        select: {
          id: true,
          prixUnitaire: true,
          quantite: true,
          oeuvre: {
            select: {
              id: true,
              titre: true,
              categorie: { select: { id: true, nom: true } },
            },
          },
        },
      },
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
} satisfies Prisma.CommandeSelect;

export type CommandeDetailedResult = Prisma.CommandeGetPayload<{
  select: typeof commandeDetailedSelect;
}>;

// Sélection pour la liste « Mes commandes » de l'acheteur : suffisante pour
// afficher une carte de commande sans requêtes supplémentaires. La commission
// est conservée pour compatibilité API (la supprimer serait breaking).
export const acheteurCommandeListSelect = {
  id: true,
  dateCreation: true,
  statut: true,
  typeCommande: true,
  montantTotal: true,
  fraisLivraison: true,
  commission: true,
  lignesCommande: {
    select: {
      id: true,
      quantite: true,
      commandeArtisanId: true,
      oeuvre: {
        select: {
          id: true,
          titre: true,
          // Couverture : première image de type OEUVRE (ordre croissant),
          // convention du module marketplace.
          medias: {
            where: { type: 'OEUVRE' },
            orderBy: { ordre: 'asc' },
            take: 1,
            select: { id: true, url: true },
          },
        },
      },
      artisan: {
        select: {
          id: true,
          nomAtelier: true,
          user: { select: { nom: true } },
        },
      },
    },
  },
  commandesArtisans: {
    select: {
      id: true,
      statut: true,
      sousTotal: true,
      montantTotal: true,
      artisan: {
        select: {
          id: true,
          nomAtelier: true,
          user: { select: { nom: true } },
        },
      },
    },
  },
  paiement: {
    select: { id: true, statut: true, methode: true, montant: true },
  },
  livraison: {
    select: { id: true, statut: true, transporteur: true, numeroSuivi: true },
  },
} satisfies Prisma.CommandeSelect;

export type AcheteurCommandeListResult = Prisma.CommandeGetPayload<{
  select: typeof acheteurCommandeListSelect;
}>;

export const artisanCommandeListSelect = {
  id: true,
  statut: true,
  sousTotal: true,
  commission: true,
  fraisLivraison: true,
  montantTotal: true,
  createdAt: true,
  updatedAt: true,
  commande: {
    select: {
      id: true,
      dateCreation: true,
      statut: true,
      acheteur: {
        select: {
          user: { select: { nom: true } },
        },
      },
      livraison: {
        select: { adresseDest: true },
      },
    },
  },
  lignesCommande: {
    select: {
      id: true,
      prixUnitaire: true,
      quantite: true,
      oeuvre: { select: { id: true, titre: true } },
    },
  },
} satisfies Prisma.CommandeArtisanSelect;

export const artisanCommandeDetailSelect = {
  id: true,
  statut: true,
  sousTotal: true,
  commission: true,
  fraisLivraison: true,
  montantTotal: true,
  createdAt: true,
  updatedAt: true,
  commande: {
    select: {
      id: true,
      dateCreation: true,
      statut: true,
      montantTotal: true,
      acheteur: {
        select: {
          typeClient: true,
          devise: true,
          user: { select: { nom: true } },
        },
      },
      livraison: {
        select: {
          id: true,
          transporteur: true,
          numeroSuivi: true,
          statut: true,
          adresseDest: true,
        },
      },
    },
  },
  lignesCommande: {
    select: {
      id: true,
      prixUnitaire: true,
      quantite: true,
      oeuvre: {
        select: {
          id: true,
          titre: true,
          categorie: { select: { id: true, nom: true } },
        },
      },
    },
  },
} satisfies Prisma.CommandeArtisanSelect;

export type ArtisanCommandeListResult = Prisma.CommandeArtisanGetPayload<{
  select: typeof artisanCommandeListSelect;
}>;

export type ArtisanCommandeDetailResult = Prisma.CommandeArtisanGetPayload<{
  select: typeof artisanCommandeDetailSelect;
}>;
