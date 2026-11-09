import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://user:password@localhost:5432/gamalone_test';
  process.env.PAYDUNYA_MASTER_KEY = 'test_master_key';
  process.env.PAYDUNYA_PRIVATE_KEY = 'test_private_key';
  process.env.PAYDUNYA_TOKEN = 'test_token';
  process.env.PAYDUNYA_MODE = 'test';
});

import { env } from '../../src/config/env.js';
import { PaymentRepository } from '../../src/modules/payments/payment.repository.js';
import { PaymentService } from '../../src/modules/payments/payment.service.js';
import { sanitizeDiagnostic } from '../../src/modules/payments/payment.sanitize.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const schema = readFileSync(path.resolve(here, '../../prisma/schema.prisma'), 'utf8');
const migration = readFileSync(
  path.resolve(
    here,
    '../../prisma/migrations/20261013120000_add_payment_reconciliation_and_reception/migration.sql'
  ),
  'utf8'
);

function modelBody(modelName: string): string {
  const match = schema.match(new RegExp(`model ${modelName}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'));
  expect(match, `model ${modelName} should exist`).toBeTruthy();
  return match![1];
}

// ---------------------------------------------------------------------------
// Schéma + migration
// ---------------------------------------------------------------------------

describe('Double payment reconciliation: schema and migration', () => {
  it('flags the Paiement model with a reconciliation marker defaulting to false', () => {
    const body = modelBody('Paiement');
    expect(body).toMatch(/reconciliationRequise\s+Boolean\s+@default\(false\)/);
  });

  it('stores the buyer reception confirmation date on Livraison', () => {
    const body = modelBody('Livraison');
    expect(body).toMatch(/dateReceptionConfirmee\s+DateTime\?/);
  });

  it('adds both columns through a strictly additive migration', () => {
    expect(migration).toContain('ADD COLUMN "reconciliationRequise" BOOLEAN NOT NULL DEFAULT false');
    expect(migration).toContain('ADD COLUMN "dateReceptionConfirmee" TIMESTAMP(3)');
    expect(migration).not.toMatch(/^\s*DROP\s+/im);
    expect(migration).not.toMatch(/^\s*DELETE\s+FROM/im);
    expect(migration).not.toMatch(/^\s*TRUNCATE\s/im);
  });
});

// ---------------------------------------------------------------------------
// Détection au niveau repository
// ---------------------------------------------------------------------------

function buildRepository(count: number) {
  const tx = {
    paiement: { updateMany: vi.fn().mockResolvedValue({ count: 0 }), update: vi.fn().mockResolvedValue({}) },
    paiementTentative: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      count: vi.fn().mockResolvedValue(count),
    },
    commande: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    commandeArtisan: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
    oeuvre: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
  };
  const prisma = { $transaction: vi.fn((cb: (t: unknown) => unknown) => cb(tx)) };
  const repository = new PaymentRepository(prisma as never);
  return { repository, tx };
}

const APPROVED_DATA = {
  paiementId: 'paiement-1',
  tentativeId: 'tentative-1',
  commandeId: 'commande-1',
  oeuvreIds: ['oeuvre-1'],
  referenceExterne: 'paydunya_token_987',
  statutExterne: 'completed',
  dateConfirmation: new Date(),
  datePaiementEffectif: new Date(),
};

describe('PaymentRepository.applyApprovedPayment - double payment detection', () => {
  it('flags reconciliation when another approved attempt exists', async () => {
    const { repository, tx } = buildRepository(1);

    const result = await repository.applyApprovedPayment(APPROVED_DATA);

    expect(result).toEqual({ reconciliationRequise: true });
    expect(tx.paiement.update).toHaveBeenCalledWith({
      where: { id: 'paiement-1' },
      data: { reconciliationRequise: true },
    });
  });

  it('counts only other approved attempts with a reference', async () => {
    const { repository, tx } = buildRepository(0);

    await repository.applyApprovedPayment(APPROVED_DATA);

    expect(tx.paiementTentative.count).toHaveBeenCalledWith({
      where: {
        paiementId: 'paiement-1',
        statut: 'REUSSI',
        referenceExterne: { not: null },
        id: { not: 'tentative-1' },
      },
    });
  });

  it('does not flag when no other approved attempt exists', async () => {
    const { repository, tx } = buildRepository(0);

    const result = await repository.applyApprovedPayment(APPROVED_DATA);

    expect(result).toEqual({ reconciliationRequise: false });
    expect(tx.paiement.update).not.toHaveBeenCalled();
  });

  it('does not inspect other attempts when there is no attempt id', async () => {
    const { repository, tx } = buildRepository(1);

    const result = await repository.applyApprovedPayment({ ...APPROVED_DATA, tentativeId: null });

    expect(result).toEqual({ reconciliationRequise: false });
    expect(tx.paiementTentative.count).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// Finalisation conditionnelle du webhook PayDunya
// ---------------------------------------------------------------------------

const COMMANDE_ID = '11111111-1111-1111-1111-111111111111';
const PAIEMENT_ID = '22222222-2222-2222-2222-222222222222';
const TENTATIVE_ID = '33333333-3333-3333-3333-333333333333';
const TRANSACTION_ID = 'paydunya_token_987';

function makeContext() {
  return {
    tentative: {
      id: TENTATIVE_ID,
      statut: 'EN_ATTENTE',
      statutExterne: 'pending',
      referenceExterne: TRANSACTION_ID,
      montant: 10000,
      devise: 'XOF',
      deviseExterneId: null,
      paiementId: PAIEMENT_ID,
    },
    paiement: {
      id: PAIEMENT_ID,
      montant: 10000,
      statut: 'EN_COURS',
      devise: 'XOF',
      referenceExterne: TRANSACTION_ID,
      commandeId: COMMANDE_ID,
      commande: {
        id: COMMANDE_ID,
        statut: 'EN_ATTENTE_PAIEMENT',
        lignesCommande: [{ oeuvreId: '44444444-4444-4444-4444-444444444444' }],
      },
    },
  };
}

function buildService(applyApprovedPayment: ReturnType<typeof vi.fn>) {
  const repository = {
    createWebhookEvent: vi
      .fn()
      .mockResolvedValue({ id: 'evt_1', created: true, statutTraitement: 'EN_TRAITEMENT' }),
    claimWebhookEvent: vi.fn().mockResolvedValue(true),
    attachEventToPayment: vi.fn().mockResolvedValue(undefined),
    finalizeWebhookEvent: vi.fn().mockResolvedValue(undefined),
    findWebhookContextByReference: vi.fn().mockResolvedValue(makeContext()),
    findPaiementById: vi.fn().mockResolvedValue({
      id: PAIEMENT_ID,
      montant: 10000,
      statut: 'EN_COURS',
      devise: 'XOF',
      referenceExterne: TRANSACTION_ID,
      commandeId: COMMANDE_ID,
      commande: {
        id: COMMANDE_ID,
        statut: 'EN_ATTENTE_PAIEMENT',
        lignesCommande: [{ oeuvreId: '44444444-4444-4444-4444-444444444444' }],
      },
    }),
    findPaymentEventByReference: vi.fn().mockResolvedValue(null),
    recordPaymentEvent: vi.fn().mockResolvedValue({ id: 'evt_1', created: true, statutTraitement: 'EN_TRAITEMENT' }),
    updatePaymentEventStatus: vi.fn().mockResolvedValue({}),
    markReconciliationRequired: vi.fn().mockResolvedValue({}),
    confirmPaiementFromWebhook: vi.fn().mockResolvedValue({}),
    applyApprovedPayment,
    applyFailedPayment: vi.fn(),
    applyRefundedPayment: vi.fn(),
    recordTransferred: vi.fn(),
  };
  const paydunya = {
    confirmInvoice: vi.fn().mockResolvedValue({
      invoice: {
        id: TRANSACTION_ID,
        status: 'completed',
        total_amount: 10000,
        currency: 'XOF',
        custom_data: { commande_id: COMMANDE_ID, paiement_id: PAIEMENT_ID },
      },
    }),
  };
  return {
    service: new PaymentService(repository as never, paydunya as never),
    repository,
  };
}

afterEach(() => {
  env.PAYDUNYA_MASTER_KEY = 'test_master_key';
  env.PAYDUNYA_PRIVATE_KEY = 'test_private_key';
  env.PAYDUNYA_TOKEN = 'test_token';
  env.PAYDUNYA_MODE = 'test';
});

describe('PaymentService PayDunya webhook finalization with reconciliation', () => {
  it('records the anomaly reason when a double approval is detected', async () => {
    const { service, repository } = buildService(
      vi.fn().mockResolvedValue({ reconciliationRequise: true })
    );
    const input = { token: TRANSACTION_ID, status: 'completed', payload: { data: { token: TRANSACTION_ID } } };

    const result = await service.handlePayDunyaIpn(input);

    expect(result.statut).toBe('TRAITE');
    expect(repository.confirmPaiementFromWebhook).toHaveBeenCalledWith({
      paiementId: PAIEMENT_ID,
      referenceExterne: TRANSACTION_ID,
      montant: 10000,
      devise: 'XOF',
    });
    expect(repository.updatePaymentEventStatus).toHaveBeenCalledWith(
      `paydunya:${TRANSACTION_ID}:completed`,
      'TRAITE'
    );
  });

  it('keeps the plain finalization when no anomaly is detected', async () => {
    const { service, repository } = buildService(
      vi.fn().mockResolvedValue({ reconciliationRequise: false })
    );
    const input = { token: TRANSACTION_ID, status: 'completed', payload: { data: { token: TRANSACTION_ID } } };

    await service.handlePayDunyaIpn(input);

    expect(repository.confirmPaiementFromWebhook).toHaveBeenCalledWith({
      paiementId: PAIEMENT_ID,
      referenceExterne: TRANSACTION_ID,
      montant: 10000,
      devise: 'XOF',
    });
    expect(repository.updatePaymentEventStatus).toHaveBeenCalledWith(
      `paydunya:${TRANSACTION_ID}:completed`,
      'TRAITE'
    );
  });
});

// ---------------------------------------------------------------------------
// Nettoyage des diagnostics
// ---------------------------------------------------------------------------

describe('sanitizeDiagnostic', () => {
  it('redacts sensitive keys recursively', () => {
    const sanitized = sanitizeDiagnostic({
      message: 'boom',
      signature: 'abc',
      nested: { apiKey: 'sk', ok: true },
      items: [{ token: 'x' }],
    }) as Record<string, unknown>;

    expect(sanitized.message).toBe('boom');
    expect(sanitized.signature).toBe('[redacted]');
    expect((sanitized.nested as Record<string, unknown>).apiKey).toBe('[redacted]');
    expect((sanitized.nested as Record<string, unknown>).ok).toBe(true);
    expect((sanitized.items as Record<string, unknown>[])[0]!.token).toBe('[redacted]');
  });

  it('passes through primitives and null', () => {
    expect(sanitizeDiagnostic(null)).toBeNull();
    expect(sanitizeDiagnostic('text')).toBe('text');
    expect(sanitizeDiagnostic(42)).toBe(42);
  });
});