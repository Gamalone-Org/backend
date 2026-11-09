import type {
  ArtisanPaiementMethode,
  OrderStatus,
  PaymentStatus,
} from '../../generated/prisma/client.js';

/**
 * Délai (en heures) affiché entre la confirmation de réception par l'acheteur et
 * la disponibilité « cible » du reversement. Il est purement informatif : il ne
 * bloque PAS le déclenchement par l'administrateur (décision Lot 5). Il sert à
 * exposer une échéance (`dateEcheance`) et un indicateur (`delaiExpire`).
 */
export const PAYOUT_DELAY_HOURS = 72;

/** Statuts de sous-commande artisan compatibles avec un reversement. */
const ELIGIBLE_COMMANDE_ARTISAN_STATUSES: ReadonlyArray<OrderStatus> = ['LIVREE', 'CLOTUREE'];

/**
 * Motifs de non-éligibilité d'un reversement. Le code est stable (utilisable
 * côté API/client) ; le message associé est destiné à l'affichage admin.
 */
export type PayoutBlockReason =
  | 'COMMANDE_ANNULEE'
  | 'COMMANDE_ARTISAN_NON_LIVREE'
  | 'PAIEMENT_NON_REUSSI'
  | 'RECONCILIATION_PAIEMENT'
  | 'RECEPTION_NON_CONFIRMEE'
  | 'MONTANT_NET_INVALIDE'
  | 'METHODE_MANQUANTE'
  | 'COORDONNEES_MANQUANTES';

export const PAYOUT_BLOCK_MESSAGES: Record<PayoutBlockReason, string> = {
  COMMANDE_ANNULEE: 'La commande est annulée ou remboursée.',
  COMMANDE_ARTISAN_NON_LIVREE:
    'La sous-commande artisan doit être livrée ou clôturée avant tout reversement.',
  PAIEMENT_NON_REUSSI: "Le paiement de la commande n'est pas confirmé.",
  RECONCILIATION_PAIEMENT: 'Le paiement est en anomalie de réconciliation.',
  RECEPTION_NON_CONFIRMEE: "La réception n'a pas été confirmée par l'acheteur.",
  MONTANT_NET_INVALIDE: 'Le montant net du reversement est invalide.',
  METHODE_MANQUANTE: "Aucune préférence de versement n'est renseignée.",
  COORDONNEES_MANQUANTES: 'Les coordonnées de versement sont incomplètes.',
};

export type PayoutEligibilityContext = {
  commandeStatut: OrderStatus;
  commandeArtisanStatut: OrderStatus;
  paiementStatut: PaymentStatus | null;
  reconciliationRequise: boolean;
  dateReceptionConfirmee: Date | null;
  /** Montant brut persistant (CommandeArtisan.sousTotal). */
  sousTotal: number;
  /** Commission plateforme persistante (CommandeArtisan.commission). */
  commission: number;
  methode: ArtisanPaiementMethode | null;
  hasMobileMoneyNumero: boolean;
  hasVirementDetails: boolean;
};

export type PayoutEligibility = {
  eligible: boolean;
  raisons: PayoutBlockReason[];
  montantBrut: number;
  commission: number;
  montantNet: number;
  dateReceptionConfirmee: Date | null;
  dateEcheance: Date | null;
  delaiExpire: boolean;
};

/**
 * Évalue l'éligibilité d'un reversement à partir des SEULES valeurs persistées
 * (jamais d'un taux de commission courant, jamais d'un recalcul). Le délai de
 * 72 h est exposé mais n'entre pas dans la décision.
 */
export function evaluatePayoutEligibility(
  context: PayoutEligibilityContext,
  now: Date = new Date()
): PayoutEligibility {
  const raisons: PayoutBlockReason[] = [];

  if (context.commandeStatut === 'ANNULEE' || context.commandeStatut === 'REMBOURSEE') {
    raisons.push('COMMANDE_ANNULEE');
  }

  if (
    context.commandeArtisanStatut === 'ANNULEE' ||
    context.commandeArtisanStatut === 'REMBOURSEE'
  ) {
    raisons.push('COMMANDE_ANNULEE');
  } else if (!ELIGIBLE_COMMANDE_ARTISAN_STATUSES.includes(context.commandeArtisanStatut)) {
    raisons.push('COMMANDE_ARTISAN_NON_LIVREE');
  }

  if (context.paiementStatut !== 'REUSSI') {
    raisons.push('PAIEMENT_NON_REUSSI');
  }

  if (context.reconciliationRequise) {
    raisons.push('RECONCILIATION_PAIEMENT');
  }

  if (!context.dateReceptionConfirmee) {
    raisons.push('RECEPTION_NON_CONFIRMEE');
  }

  const montantBrut = context.sousTotal;
  const commission = context.commission;
  const montantNet = montantBrut - commission;
  const montantValide =
    Number.isSafeInteger(montantBrut) &&
    Number.isSafeInteger(commission) &&
    montantBrut > 0 &&
    commission >= 0 &&
    montantNet > 0;
  if (!montantValide) {
    raisons.push('MONTANT_NET_INVALIDE');
  }

  if (!context.methode) {
    raisons.push('METHODE_MANQUANTE');
  } else if (context.methode === 'MOBILE_MONEY' && !context.hasMobileMoneyNumero) {
    raisons.push('COORDONNEES_MANQUANTES');
  } else if (context.methode === 'VIREMENT_BANCAIRE' && !context.hasVirementDetails) {
    raisons.push('COORDONNEES_MANQUANTES');
  }

  const dateEcheance = context.dateReceptionConfirmee
    ? new Date(context.dateReceptionConfirmee.getTime() + PAYOUT_DELAY_HOURS * 60 * 60 * 1000)
    : null;

  return {
    eligible: raisons.length === 0,
    raisons,
    montantBrut,
    commission,
    montantNet,
    dateReceptionConfirmee: context.dateReceptionConfirmee,
    dateEcheance,
    delaiExpire: dateEcheance ? now.getTime() >= dateEcheance.getTime() : false,
  };
}
