import { describe, expect, it, vi } from 'vitest';
import { OrderService } from '../../src/modules/orders/order.service.js';
import { describePaymentState } from '../../src/modules/orders/order.payment-view.js';

const BUYER_PROFILE = { id: 'buyer-1' };

function buildService(repository: Record<string, unknown> = {}) {
  const repo = {
    findBuyerProfileByUserId: vi.fn().mockResolvedValue(BUYER_PROFILE),
    findCommandeForReception: vi.fn(),
    confirmReception: vi.fn().mockResolvedValue(true),
    findByIdMine: vi.fn().mockResolvedValue({ id: 'cmd-1', statut: 'LIVREE' }),
    findForAcheteur: vi.fn().mockResolvedValue({ commandes: [], total: 0 }),
    ...repository,
  };
  return { service: new OrderService(repo as never), repo };
}

function receptionContext(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cmd-1',
    statut: 'LIVREE',
    paiement: { statut: 'REUSSI' },
    livraison: { id: 'liv-1', statut: 'LIVREE', dateReceptionConfirmee: null },
    ...overrides,
  };
}

describe('describePaymentState', () => {
  it('reports a confirmed payment when REUSSI', () => {
    expect(describePaymentState('REUSSI', 'approved', 'COMMANDE')).toEqual({
      etat: 'CONFIRME',
      libelle: 'Paiement confirmé',
      peutRelancer: false,
    });
  });

  it('reports a refunded payment when REMBOURSE', () => {
    expect(describePaymentState('REMBOURSE', null, 'REMBOURSEE').etat).toBe('REMBOURSE');
  });

  it('allows a retry on a failed payment while the order still awaits payment', () => {
    expect(describePaymentState('ECHOUE', 'declined', 'EN_ATTENTE_PAIEMENT')).toMatchObject({
      etat: 'ECHOUE',
      peutRelancer: true,
    });
  });

  it('does not allow a retry once the order moved past payment', () => {
    expect(describePaymentState('ECHOUE', 'declined', 'COMMANDE')).toMatchObject({
      etat: 'ECHOUE',
      peutRelancer: false,
    });
  });

  it('marks a pending payment as retryable only while awaiting payment', () => {
    expect(describePaymentState('EN_ATTENTE', null, 'EN_ATTENTE_PAIEMENT').peutRelancer).toBe(true);
    expect(describePaymentState('EN_ATTENTE', null, 'COMMANDE').peutRelancer).toBe(false);
  });

  it('treats an in-progress payment as non-retryable', () => {
    expect(describePaymentState('EN_COURS', 'pending', 'EN_ATTENTE_PAIEMENT')).toMatchObject({
      etat: 'EN_COURS',
      peutRelancer: false,
    });
  });
});

describe('OrderService.getMyCommandes - payment view projection', () => {
  it('enriches each order that has a payment with a readable state', async () => {
    const { service } = buildService({
      findForAcheteur: vi.fn().mockResolvedValue({
        commandes: [
          {
            id: 'cmd-1',
            statut: 'COMMANDE',
            paiement: { statut: 'REUSSI', statutExterne: 'approved' },
          },
        ],
        total: 1,
      }),
    });

    const result = await service.getMyCommandes('user-1', 1, 20);

    expect(result.commandes[0]!.paiement).toMatchObject({
      statut: 'REUSSI',
      etat: 'CONFIRME',
      peutRelancer: false,
    });
  });

  it('leaves an order without payment untouched', async () => {
    const original = { id: 'cmd-1', statut: 'COMMANDE' };
    const { service } = buildService({
      findForAcheteur: vi.fn().mockResolvedValue({ commandes: [original], total: 1 }),
    });

    const result = await service.getMyCommandes('user-1', 1, 20);

    expect(result.commandes[0]).toEqual(original);
  });
});

describe('OrderService.confirmerReception', () => {
  it('rejects when the buyer profile does not exist', async () => {
    const { service } = buildService({
      findBuyerProfileByUserId: vi.fn().mockResolvedValue(null),
    });

    await expect(service.confirmerReception('user-1', 'cmd-1')).rejects.toMatchObject({
      statusCode: 403,
    });
  });

  it('rejects when the order is not owned by the buyer', async () => {
    const { service, repo } = buildService({
      findCommandeForReception: vi.fn().mockResolvedValue(null),
    });

    await expect(service.confirmerReception('user-1', 'cmd-1')).rejects.toMatchObject({
      statusCode: 404,
    });
    expect(repo.confirmReception).not.toHaveBeenCalled();
  });

  it('rejects when the payment is not confirmed', async () => {
    const { service, repo } = buildService({
      findCommandeForReception: vi
        .fn()
        .mockResolvedValue(receptionContext({ paiement: { statut: 'EN_COURS' } })),
    });

    await expect(service.confirmerReception('user-1', 'cmd-1')).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(repo.confirmReception).not.toHaveBeenCalled();
  });

  it('rejects when the delivery is not effective', async () => {
    const { service, repo } = buildService({
      findCommandeForReception: vi.fn().mockResolvedValue(
        receptionContext({
          livraison: { id: 'liv-1', statut: 'EN_TRANSIT', dateReceptionConfirmee: null },
        })
      ),
    });

    await expect(service.confirmerReception('user-1', 'cmd-1')).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(repo.confirmReception).not.toHaveBeenCalled();
  });

  it('records the reception date on the first confirmation', async () => {
    const { service, repo } = buildService({
      findCommandeForReception: vi.fn().mockResolvedValue(receptionContext()),
    });

    const result = await service.confirmerReception('user-1', 'cmd-1');

    expect(repo.confirmReception).toHaveBeenCalledWith('liv-1', expect.any(Date));
    expect(result.dejaConfirmee).toBe(false);
  });

  it('is idempotent when the reception was already confirmed', async () => {
    const { service, repo } = buildService({
      findCommandeForReception: vi.fn().mockResolvedValue(
        receptionContext({
          livraison: { id: 'liv-1', statut: 'LIVREE', dateReceptionConfirmee: new Date() },
        })
      ),
    });

    const result = await service.confirmerReception('user-1', 'cmd-1');

    expect(repo.confirmReception).not.toHaveBeenCalled();
    expect(result.dejaConfirmee).toBe(true);
  });

  it('reports an existing confirmation when a concurrent write won the race', async () => {
    const { service } = buildService({
      findCommandeForReception: vi.fn().mockResolvedValue(receptionContext()),
      confirmReception: vi.fn().mockResolvedValue(false),
    });

    const result = await service.confirmerReception('user-1', 'cmd-1');

    expect(result.dejaConfirmee).toBe(true);
  });
});
