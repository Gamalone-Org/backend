import { describe, expect, it } from 'vitest';
import {
  evaluatePayoutEligibility,
  PAYOUT_DELAY_HOURS,
  type PayoutEligibilityContext,
} from '../../src/modules/payouts/payout.eligibility.js';

function baseContext(overrides: Partial<PayoutEligibilityContext> = {}): PayoutEligibilityContext {
  return {
    commandeStatut: 'LIVREE',
    commandeArtisanStatut: 'LIVREE',
    paiementStatut: 'REUSSI',
    reconciliationRequise: false,
    dateReceptionConfirmee: new Date('2026-10-01T10:00:00.000Z'),
    sousTotal: 10_000,
    commission: 1_000,
    methode: 'MOBILE_MONEY',
    hasMobileMoneyNumero: true,
    hasVirementDetails: false,
    ...overrides,
  };
}

describe('evaluatePayoutEligibility', () => {
  it('is eligible as soon as reception is confirmed (72h is informational only)', () => {
    const now = new Date('2026-10-01T10:01:00.000Z');
    const result = evaluatePayoutEligibility(baseContext(), now);

    expect(result.eligible).toBe(true);
    expect(result.raisons).toEqual([]);
    expect(result.montantNet).toBe(9_000);
    expect(result.delaiExpire).toBe(false);
  });

  it('never includes the 72h delay as a blocking reason, even before expiry', () => {
    const reception = new Date('2026-10-01T10:00:00.000Z');
    const now = new Date('2026-10-01T11:00:00.000Z');
    const result = evaluatePayoutEligibility(baseContext({ dateReceptionConfirmee: reception }), now);

    expect(result.eligible).toBe(true);
    expect(result.raisons).not.toContain('RECEPTION_NON_CONFIRMEE');
  });

  it('computes dateEcheance as reception + 72h and flags delaiExpire afterwards', () => {
    const reception = new Date('2026-10-01T10:00:00.000Z');
    const before = evaluatePayoutEligibility(
      baseContext({ dateReceptionConfirmee: reception }),
      new Date('2026-10-04T09:00:00.000Z')
    );
    expect(before.dateEcheance?.toISOString()).toBe('2026-10-04T10:00:00.000Z');
    expect(before.delaiExpire).toBe(false);

    const after = evaluatePayoutEligibility(
      baseContext({ dateReceptionConfirmee: reception }),
      new Date('2026-10-04T11:00:00.000Z')
    );
    expect(after.delaiExpire).toBe(true);
    expect(after.eligible).toBe(true);
    expect(PAYOUT_DELAY_HOURS).toBe(72);
  });

  it('blocks a cancelled or refunded command', () => {
    expect(evaluatePayoutEligibility(baseContext({ commandeStatut: 'ANNULEE' })).raisons).toContain(
      'COMMANDE_ANNULEE'
    );
    expect(evaluatePayoutEligibility(baseContext({ commandeStatut: 'REMBOURSEE' })).eligible).toBe(
      false
    );
  });

  it('blocks a sub-order that is not delivered/closed', () => {
    const result = evaluatePayoutEligibility(baseContext({ commandeArtisanStatut: 'EXPEDIEE' }));
    expect(result.eligible).toBe(false);
    expect(result.raisons).toContain('COMMANDE_ARTISAN_NON_LIVREE');
  });

  it('accepts a closed sub-order as eligible', () => {
    const result = evaluatePayoutEligibility(baseContext({ commandeArtisanStatut: 'CLOTUREE' }));
    expect(result.eligible).toBe(true);
  });

  it('blocks a payment that is not successful', () => {
    expect(evaluatePayoutEligibility(baseContext({ paiementStatut: 'EN_ATTENTE' })).raisons).toContain(
      'PAIEMENT_NON_REUSSI'
    );
    expect(evaluatePayoutEligibility(baseContext({ paiementStatut: null })).eligible).toBe(false);
  });

  it('blocks a payment flagged for reconciliation', () => {
    const result = evaluatePayoutEligibility(baseContext({ reconciliationRequise: true }));
    expect(result.raisons).toContain('RECONCILIATION_PAIEMENT');
  });

  it('blocks an unconfirmed reception', () => {
    const result = evaluatePayoutEligibility(baseContext({ dateReceptionConfirmee: null }));
    expect(result.raisons).toContain('RECEPTION_NON_CONFIRMEE');
    expect(result.dateEcheance).toBeNull();
    expect(result.delaiExpire).toBe(false);
  });

  it('blocks a missing or invalid net amount', () => {
    expect(evaluatePayoutEligibility(baseContext({ sousTotal: 0 })).raisons).toContain(
      'MONTANT_NET_INVALIDE'
    );
    expect(
      evaluatePayoutEligibility(baseContext({ sousTotal: 1_000, commission: 1_000 })).raisons
    ).toContain('MONTANT_NET_INVALIDE');
    expect(evaluatePayoutEligibility(baseContext({ commission: -1 })).raisons).toContain(
      'MONTANT_NET_INVALIDE'
    );
  });

  it('blocks a missing payment preference method', () => {
    const result = evaluatePayoutEligibility(baseContext({ methode: null }));
    expect(result.raisons).toContain('METHODE_MANQUANTE');
  });

  it('blocks incomplete mobile money or bank details', () => {
    expect(
      evaluatePayoutEligibility(baseContext({ hasMobileMoneyNumero: false })).raisons
    ).toContain('COORDONNEES_MANQUANTES');
    expect(
      evaluatePayoutEligibility(baseContext({ methode: 'VIREMENT_BANCAIRE', hasVirementDetails: false }))
        .raisons
    ).toContain('COORDONNEES_MANQUANTES');
    expect(
      evaluatePayoutEligibility(baseContext({ methode: 'VIREMENT_BANCAIRE', hasVirementDetails: true }))
        .eligible
    ).toBe(true);
  });

  it('never recomputes the commission from a current rate (uses persisted values)', () => {
    const result = evaluatePayoutEligibility(baseContext({ sousTotal: 4_321, commission: 321 }));
    expect(result.montantBrut).toBe(4_321);
    expect(result.commission).toBe(321);
    expect(result.montantNet).toBe(4_000);
  });
});
