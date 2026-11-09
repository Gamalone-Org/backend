import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://user:password@localhost:5432/gamalone_test';
  process.env.PAYDUNYA_MASTER_KEY = 'test_master_key';
  process.env.PAYDUNYA_PRIVATE_KEY = 'test_private_key';
  process.env.PAYDUNYA_TOKEN = 'test_token';
  process.env.PAYDUNYA_MODE = 'test';
});

import { PaymentService } from '../../src/modules/payments/payment.service.js';
import { PayDunyaClient } from '../../src/modules/payments/paydunya.client.js';

const TOKEN = 'paydunya_token_123';
const PAIEMENT_ID = '22222222-2222-2222-2222-222222222222';

function build(overrides: { repo?: Record<string, unknown>; paydunya?: Record<string, unknown> } = {}) {
  const repository = {
    findPaymentEventByReference: vi.fn().mockResolvedValue(null),
    recordPaymentEvent: vi.fn().mockResolvedValue(undefined),
    updatePaymentEventStatus: vi.fn().mockResolvedValue(undefined),
    findWebhookContextByReference: vi.fn().mockResolvedValue({ tentative: { paiementId: PAIEMENT_ID } }),
    findPaiementById: vi.fn().mockResolvedValue({ id: PAIEMENT_ID, montant: 10000, devise: 'XOF' }),
    confirmPaiementFromWebhook: vi.fn().mockResolvedValue(undefined),
    failPaiementFromWebhook: vi.fn().mockResolvedValue(undefined),
    markReconciliationRequired: vi.fn().mockResolvedValue(undefined),
    ...overrides.repo,
  };
  const paydunya = {
    confirmInvoice: vi.fn().mockResolvedValue({
      response_code: '00',
      status: 'completed',
      invoice: {
        token: TOKEN,
        status: 'completed',
        total_amount: 10000,
        currency: 'XOF',
      },
    }),
    ...overrides.paydunya,
  };
  const service = new PaymentService(repository as any, paydunya as unknown as PayDunyaClient);
  return { service, repository, paydunya };
}

describe('PaymentService.handlePayDunyaIpn', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('handles a completed payment IPN successfully', async () => {
    const { service, repository, paydunya } = build();

    const result = await service.handlePayDunyaIpn({
      token: TOKEN,
      status: 'completed',
      payload: {},
    });

    expect(result.statut).toBe('TRAITE');
    expect(paydunya.confirmInvoice).toHaveBeenCalledWith(TOKEN);
    expect(repository.confirmPaiementFromWebhook).toHaveBeenCalledWith(
      expect.objectContaining({
        paiementId: PAIEMENT_ID,
        referenceExterne: TOKEN,
        montant: 10000,
        devise: 'XOF',
      })
    );
  });

  it('is idempotent when event is already treated', async () => {
    const { service, repository, paydunya } = build({
      repo: {
        findPaymentEventByReference: vi.fn().mockResolvedValue({ statutTraitement: 'TRAITE' }),
      },
    });

    const result = await service.handlePayDunyaIpn({
      token: TOKEN,
      status: 'completed',
      payload: {},
    });

    expect(result.statut).toBe('IGNORE');
    expect(paydunya.confirmInvoice).not.toHaveBeenCalled();
    expect(repository.confirmPaiementFromWebhook).not.toHaveBeenCalled();
  });

  it('marks reconciliation required when amount does not match', async () => {
    const { service, repository } = build({
      paydunya: {
        confirmInvoice: vi.fn().mockResolvedValue({
          response_code: '00',
          status: 'completed',
          invoice: {
            token: TOKEN,
            status: 'completed',
            total_amount: 5000, // Mismatch
            currency: 'XOF',
          },
        }),
      },
    });

    await expect(
      service.handlePayDunyaIpn({
        token: TOKEN,
        status: 'completed',
        payload: {},
      })
    ).rejects.toMatchObject({ code: 'PAYDUNYA_AMOUNT_MISMATCH' });

    expect(repository.markReconciliationRequired).toHaveBeenCalledWith(
      PAIEMENT_ID,
      expect.objectContaining({ reason: 'PAYDUNYA_AMOUNT_MISMATCH' })
    );
  });
});
