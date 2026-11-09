import { describe, expect, it } from 'vitest';
import {
  buildPayoutDestination,
  splitName,
  type BeneficiaryPreference,
} from '../../src/modules/payouts/payout.beneficiary.js';

function preference(overrides: Partial<BeneficiaryPreference> = {}): BeneficiaryPreference {
  return {
    methode: 'MOBILE_MONEY',
    mobileMoneyNumero: '+2250700000000',
    mobileMoneyOperateur: 'Orange',
    virementNomBanque: null,
    virementIban: null,
    virementNomCompte: null,
    ...overrides,
  };
}

describe('buildPayoutDestination', () => {
  it('omits the FedaPay mode for mobile money so the operator is auto-detected', () => {
    const destination = buildPayoutDestination(
      {
        methode: 'MOBILE_MONEY',
        mobileMoneyNumero: '+2250700000001',
        mobileMoneyOperateur: 'Orange',
        virementNomBanque: null,
        virementIban: null,
        virementNomCompte: null,
      },
      '+2250000000000'
    );

    expect(destination.mode).toBeNull();
    expect(destination.phone).toEqual({ number: '0700000001', country: 'CI' });
    expect(destination.masquee).toBe('Orange •••• 01');
    expect(destination.masquee).not.toContain('070000000');
  });

  it('uses mode "bank" for bank transfers and never converts to mobile money', () => {
    const destination = buildPayoutDestination(
      {
        methode: 'VIREMENT_BANCAIRE',
        mobileMoneyNumero: null,
        mobileMoneyOperateur: null,
        virementNomBanque: 'Ecobank',
        virementIban: 'TG53 TG00 1234 5678 9012',
        virementNomCompte: 'Akossiwa Doe',
      },
      '+22890000000'
    );

    expect(destination.mode).toBe('bank');
    expect(destination.masquee).toBe('Ecobank •••• 9012');
    expect(destination.phone).toEqual({ number: '90000000', country: 'TG' });
  });

  it('falls back on the user phone for mobile money when the preference number is empty', () => {
    const destination = buildPayoutDestination(
      {
        methode: 'MOBILE_MONEY',
        mobileMoneyNumero: null,
        mobileMoneyOperateur: 'MTN',
        virementNomBanque: null,
        virementIban: null,
        virementNomCompte: null,
      },
      '+22997000000'
    );
    expect(destination.phone).toEqual({ number: '97000000', country: 'BJ' });
  });

  it('omits the phone rather than guessing an unknown country code', () => {
    const destination = buildPayoutDestination(
      {
        methode: 'MOBILE_MONEY',
        mobileMoneyNumero: '+99912345678',
        mobileMoneyOperateur: null,
        virementNomBanque: null,
        virementIban: null,
        virementNomCompte: null,
      },
      '+99912345678'
    );
    expect(destination.phone).toBeNull();
    expect(destination.masquee).toBe('•••• 78');
  });

  it('masks bank credentials with the last four IBAN characters only', () => {
    const destination = buildPayoutDestination(
      {
        methode: 'VIREMENT_BANCAIRE',
        mobileMoneyNumero: null,
        mobileMoneyOperateur: null,
        virementNomBanque: 'Ecobank',
        virementIban: 'TG53 0000 1111 2222',
        virementNomCompte: 'Awa',
      },
      '+22890000000'
    );
    expect(destination.masquee).toBe('Ecobank •••• 2222');
    expect(destination.masquee).not.toContain('1111');
  });
});

describe('splitName', () => {
  it('returns null for an empty name', () => {
    expect(splitName('')).toBeNull();
    expect(splitName('   ')).toBeNull();
    expect(splitName(null)).toBeNull();
  });

  it('duplicates a single token as firstname and lastname', () => {
    expect(splitName('Awa')).toEqual({ firstname: 'Awa', lastname: 'Awa' });
  });

  it('splits a full name on the last token', () => {
    expect(splitName('Awa Diop Ndiaye')).toEqual({ firstname: 'Awa Diop', lastname: 'Ndiaye' });
  });
});
