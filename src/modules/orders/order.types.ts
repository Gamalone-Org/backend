import type { Prisma } from '../../generated/prisma/client.js';

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
