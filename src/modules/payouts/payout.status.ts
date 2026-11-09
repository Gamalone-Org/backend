import type { PayoutStatus } from '../../generated/prisma/client.js';

/**
 * Traduit un statut FedaPay de reversement en statut interne. Un statut
 * inconnu/vide n'est JAMAIS interprété comme un succès : il est marqué comme
 * ambigu, ce qui impose une réconciliation manuelle et interdit toute nouvelle
 * tentative automatique.
 *
 * Cycle FedaPay : pending → started → processing → sent | failed.
 */
export function mapRemotePayoutStatus(status: string | null | undefined): PayoutStatus {
  const value = status?.trim().toLowerCase();
  switch (value) {
    case 'sent':
    case 'successful':
    case 'succeeded':
    case 'approved':
      return 'VERSE';
    case 'failed':
    case 'declined':
    case 'canceled':
    case 'cancelled':
    case 'rejected':
      return 'ECHOUE';
    case 'pending':
    case 'started':
    case 'processing':
    case 'scheduled':
      return 'EN_TRAITEMENT';
    default:
      return 'RECONCILIATION_REQUISE';
  }
}

/** Statuts internes pour lesquels un reversement peut encore être (re)déclenché. */
export const RETRYABLE_PAYOUT_STATUSES: ReadonlyArray<PayoutStatus> = ['ECHOUE'];

/** Statuts internes considérés comme terminaux (aucune nouvelle tentative). */
export const TERMINAL_PAYOUT_STATUSES: ReadonlyArray<PayoutStatus> = ['VERSE'];
