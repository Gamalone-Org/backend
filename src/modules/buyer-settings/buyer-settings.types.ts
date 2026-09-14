import type { Prisma } from '../../generated/prisma/client.js';

// Sélection des champs de paramétrage de l'acheteur. La source de vérité est
// le BuyerProfile lui-même (Option A) : langue et devise y sont déjà les
// valeurs métier, les préférences de notification sont stockées à plat.
export const buyerParametresSelect = {
  id: true,
  langue: true,
  devise: true,
  notificationsEmail: true,
  notificationsSms: true,
  notificationsPush: true,
} satisfies Prisma.BuyerProfileSelect;

export type BuyerParametresRow = Prisma.BuyerProfileGetPayload<{
  select: typeof buyerParametresSelect;
}>;

export type BuyerLangue = 'fr' | 'en';

export type BuyerDevise = 'XOF' | 'EUR' | 'USD';

export type BuyerNotificationPreferences = {
  email: boolean;
  sms: boolean;
  push: boolean;
};

export type BuyerParametres = {
  langue: BuyerLangue;
  devise: BuyerDevise;
  notifications: BuyerNotificationPreferences;
};

// Mise à jour partielle autorisée (PATCH) : chaque clé est optionnelle.
export type UpdateBuyerParametresInput = {
  langue?: BuyerLangue;
  devise?: BuyerDevise;
  notifications?: Partial<BuyerNotificationPreferences>;
};

// Données passées au repository : les colonnes booléennes sont aplaties.
export type BuyerParametresUpdateData = {
  langue?: string;
  devise?: string;
  notificationsEmail?: boolean;
  notificationsSms?: boolean;
  notificationsPush?: boolean;
};

export function toBuyerParametres(row: BuyerParametresRow): BuyerParametres {
  return {
    langue: row.langue as BuyerLangue,
    devise: row.devise as BuyerDevise,
    notifications: {
      email: row.notificationsEmail,
      sms: row.notificationsSms,
      push: row.notificationsPush,
    },
  };
}