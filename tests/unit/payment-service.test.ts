import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://user:password@localhost:5432/gamalone_test';
  process.env.PAYDUNYA_MASTER_KEY = 'test_master_key';
  process.env.PAYDUNYA_PRIVATE_KEY = 'test_private_key';
  process.env.PAYDUNYA_TOKEN = 'test_token';
  process.env.PAYDUNYA_MODE = 'test';
});

import { AppError, ConflictError, NotFoundError, ValidationError } from '../../src/common/errors/AppError.js';
import { PaymentService } from '../../src/modules/payments/payment.service.js';
import { PayDunyaClient } from '../../src/modules/payments/paydunya.client.js';

const COMMANDE_ID = '11111111-1111-1111-1111-111111111111';
const PAIEMENT_ID = '22222222-2222-2222-2222-222222222222';
const ACHETEUR_ID = '33333333-3333-3333-3333-333333333333';

function makeCommande(overrides: Record<string, unknown> = {}) {
  return {
    id: COMMANDE_ID,
    montantTotal: 10000,
    statut: 'EN_ATTENTE_PAIEMENT',
    paiement: {
      id: PAIEMENT_ID,
      montant: 10000,
      statut: 'EN_ATTENTE',
      devise: 'XOF',
      prestataire: null,
      referenceExterne: null,
      statutExterne: null,
      urlPaiement: null,
    },
    acheteur: {
      id: ACHETEUR_ID,
      fedaPayCustomerId: null,
      user: { nom: 'Awa Doe', email: 'awa@example.com', telephone: '+22890123456' },
    },
    ...overrides,
  };
}

function build(commande: unknown) {
  const repository = {
    findOwnedOrder: vi.fn().mockResolvedValue(commande),
    claimInitialization: vi.fn().mockResolvedValue(true),
    releaseInitialization: vi.fn().mockResolvedValue(undefined),
    createAttempt: vi.fn().mockResolvedValue({ id: 'attempt_1' }),
    recordRemoteTransaction: vi.fn().mockResolvedValue(undefined),
  };
  const paydunya = {
    createInvoice: vi.fn().mockResolvedValue({
      token: 'paydunya_token',
      url: 'https://paydunya.com/invoice/paydunya_token',
    }),
    confirmInvoice: vi.fn(),
  };
  const service = new PaymentService(repository as any, paydunya as unknown as PayDunyaClient);
  return { service, repository, paydunya };
}

describe('PaymentService.initializeOrderPayment (PayDunya)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects when the commande does not exist or does not belong to the buyer', async () => {
    const { service, paydunya } = build(null);
    await expect(service.initializeOrderPayment(COMMANDE_ID, 'user_1')).rejects.toBeInstanceOf(
      NotFoundError
    );
    expect(paydunya.createInvoice).not.toHaveBeenCalled();
  });

  it('rejects when the commande has no paiement', async () => {
    const { service } = build(makeCommande({ paiement: null }));
    await expect(service.initializeOrderPayment(COMMANDE_ID, 'user_1')).rejects.toBeInstanceOf(
      ConflictError
    );
  });

  it('rejects an already successful or refunded paiement', async () => {
    const commande = makeCommande();
    commande.paiement.statut = 'REUSSI';
    const { service, paydunya } = build(commande);
    await expect(service.initializeOrderPayment(COMMANDE_ID, 'user_1')).rejects.toBeInstanceOf(
      ConflictError
    );
    expect(paydunya.createInvoice).not.toHaveBeenCalled();
  });

  it('rejects an annulée commande', async () => {
    const { service } = build(makeCommande({ statut: 'ANNULEE' }));
    await expect(service.initializeOrderPayment(COMMANDE_ID, 'user_1')).rejects.toBeInstanceOf(
      ConflictError
    );
  });

  it('creates the PayDunya invoice and returns the payment link', async () => {
    const { service, repository, paydunya } = build(makeCommande());

    const result = await service.initializeOrderPayment(COMMANDE_ID, 'user_1');

    expect(paydunya.createInvoice).toHaveBeenCalledWith(
      expect.objectContaining({
        invoice: expect.objectContaining({
          total_amount: 10000,
          description: `Paiement commande ${COMMANDE_ID}`,
        }),
      })
    );
    expect(repository.createAttempt).toHaveBeenCalledWith(
      expect.objectContaining({
        paiementId: PAIEMENT_ID,
        referenceExterne: 'paydunya_token',
        montant: 10000,
        devise: 'XOF',
        urlPaiement: 'https://paydunya.com/invoice/paydunya_token',
      })
    );
    expect(result).toEqual({
      commandeId: COMMANDE_ID,
      paiementId: PAIEMENT_ID,
      referenceExterne: 'paydunya_token',
      urlPaiement: 'https://paydunya.com/invoice/paydunya_token',
    });
  });

  it('rejects when the stored amount does not match the commande total', async () => {
    const commande = makeCommande({ montantTotal: 9999 });
    const { service, repository, paydunya } = build(commande);
    await expect(service.initializeOrderPayment(COMMANDE_ID, 'user_1')).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(repository.claimInitialization).not.toHaveBeenCalled();
    expect(paydunya.createInvoice).not.toHaveBeenCalled();
  });

  it('rejects an unsupported currency coming from the database', async () => {
    const commande = makeCommande();
    commande.paiement.devise = 'EUR';
    const { service, repository } = build(commande);
    await expect(service.initializeOrderPayment(COMMANDE_ID, 'user_1')).rejects.toBeInstanceOf(
      ValidationError
    );
    expect(repository.claimInitialization).not.toHaveBeenCalled();
  });

  it('refuses to create a transaction when another initialization is in progress', async () => {
    const { service, repository, paydunya } = build(makeCommande());
    repository.claimInitialization.mockResolvedValue(false);
    await expect(service.initializeOrderPayment(COMMANDE_ID, 'user_1')).rejects.toBeInstanceOf(
      ConflictError
    );
    expect(paydunya.createInvoice).not.toHaveBeenCalled();
  });
});
