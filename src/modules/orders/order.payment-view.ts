import type { OrderStatus, PaymentStatus } from '../../generated/prisma/client.js';

/**
 * État de paiement lisible exposé à l'acheteur (Espace Acheteur). Il ne
 * remplace PAS `statut` (statut métier brut) : il le complète pour l'affichage.
 */
export type PaymentEtat = 'EN_ATTENTE' | 'EN_COURS' | 'CONFIRME' | 'ECHOUE' | 'REMBOURSE';

export type PaymentView = {
  etat: PaymentEtat;
  libelle: string;
  peutRelancer: boolean;
};

/**
 * Dérive un état lisible et l'éligibilité à une nouvelle tentative à partir du
 * statut métier du paiement, du statut externe éventuel et du statut de la
 * commande. Aucune décision de paiement n'est prise ici : c'est une projection
 * d'affichage (source de vérité = champs en base).
 */
export function describePaymentState(
  statut: PaymentStatus,
  statutExterne: string | null | undefined,
  commandeStatut: OrderStatus
): PaymentView {
  // Une nouvelle tentative n'est pertinente que tant que la commande attend son
  // paiement (aucune relance sur une commande annulée, remboursée ou avancée).
  const commandePayable = commandeStatut === 'EN_ATTENTE_PAIEMENT';

  switch (statut) {
    case 'REUSSI':
      return { etat: 'CONFIRME', libelle: 'Paiement confirmé', peutRelancer: false };
    case 'REMBOURSE':
      return { etat: 'REMBOURSE', libelle: 'Paiement remboursé', peutRelancer: false };
    case 'ECHOUE':
      return {
        etat: 'ECHOUE',
        libelle: 'Le paiement a échoué. Une nouvelle tentative est possible.',
        peutRelancer: commandePayable,
      };
    case 'EN_COURS':
      return {
        etat: 'EN_COURS',
        libelle:
          statutExterne === 'pending'
            ? 'Paiement en cours de vérification'
            : 'Paiement en cours',
        peutRelancer: false,
      };
    case 'EN_ATTENTE':
    default:
      return {
        etat: 'EN_ATTENTE',
        libelle: 'Paiement en attente',
        peutRelancer: commandePayable,
      };
  }
}
