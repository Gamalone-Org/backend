import type { Prisma } from '../../generated/prisma/client.js';

/**
 * Sélection de la liste des paiements (back-office Admin). Aucune donnée
 * secrète (clé API, signature, payload brut) n'est sélectionnée : seuls les
 * identifiants techniques utiles à la réconciliation sont exposés.
 */
export const paymentAdminListSelect = {
  id: true,
  statut: true,
  methode: true,
  montant: true,
  devise: true,
  prestataire: true,
  referenceExterne: true,
  statutExterne: true,
  reconciliationRequise: true,
  dateInitialisation: true,
  dateConfirmation: true,
  datePaiementEffectif: true,
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
          id: true,
          user: { select: { nom: true, telephone: true } },
        },
      },
    },
  },
  _count: { select: { tentatives: true } },
} satisfies Prisma.PaiementSelect;

export type PaymentAdminListItem = Prisma.PaiementGetPayload<{
  select: typeof paymentAdminListSelect;
}>;

/**
 * Sélection du détail d'un paiement : historique complet des tentatives et des
 * événements prestataire, plus le contexte commande/acheteur. Le diagnostic
 * `erreur` des événements est nettoyé avant exposition (voir `payment.sanitize`).
 */
export const paymentAdminDetailSelect = {
  ...paymentAdminListSelect,
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
      deviseExterneId: true,
      urlPaiement: true,
      dateCreation: true,
      dateExpiration: true,
      dateReussite: true,
    },
  },
  evenements: {
    orderBy: { dateReception: 'desc' },
    select: {
      id: true,
      typeEvenement: true,
      referenceTransaction: true,
      statutTraitement: true,
      dateReception: true,
      dateTraitement: true,
      erreur: true,
    },
  },
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
          devise: true,
          user: { select: { nom: true, telephone: true, email: true } },
        },
      },
      livraison: {
        select: { id: true, statut: true, dateReceptionConfirmee: true },
      },
    },
  },
} satisfies Prisma.PaiementSelect;

export type PaymentAdminDetail = Prisma.PaiementGetPayload<{
  select: typeof paymentAdminDetailSelect;
}>;
