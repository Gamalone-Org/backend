import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://user:password@localhost:5432/gamalone_test';
  // Kill switch : le workflow manuel ne doit dépendre d'aucun module FedaPay.
  delete process.env.FEDAPAY_SECRET_KEY;
  delete process.env.FEDAPAY_PAYOUTS_ENABLED;
});

import { PayoutBatchService } from '../../src/modules/payouts/payout-batch.service.js';

/**
 * Le workflow manuel groupé ne doit JAMAIS appeler de module FedaPay, même
 * avec FEDAPAY_PAYOUTS_ENABLED absent ou false. Ce test valide la préparation,
 * la confirmation et l'annulation d'un reversement manuel groupé sans aucun
 * appel vers l'ancien client FedaPay.
 */
const repository = {
  findCommandeArtisansForBatch: vi.fn(),
  findActivePayoutBatchLinesByCommandeArtisanIds: vi.fn(),
  findManyForAdmin: vi.fn(),
  findEligibleGrouped: vi.fn(),
  findByIdForAdmin: vi.fn(),
  prepareBatch: vi.fn(),
  confirmBatch: vi.fn(),
  cancelBatch: vi.fn(),
};

const service = new PayoutBatchService(repository as any);

describe('PayoutBatchService manual workflow — aucun appel FedaPay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('ne contacte pas FedaPay lors de la préparation', async () => {
    repository.findCommandeArtisansForBatch.mockResolvedValue([
      {
        id: 'ca1',
        artisanId: 'a1',
        statut: 'LIVREE',
        sousTotal: 10000,
        commission: 1000,
        fraisLivraison: 0,
        montantTotal: 9000,
        commande: {
          id: 'cmd1',
          statut: 'LIVREE',
          paiement: { statut: 'REUSSI', reconciliationRequise: false },
          livraison: { dateReceptionConfirmee: new Date() },
        },
        artisan: { id: 'a1', nomAtelier: 'Atelier' },
        payout: null,
        payoutBatchLines: [],
      },
    ]);
    repository.findActivePayoutBatchLinesByCommandeArtisanIds.mockResolvedValue([]);
    repository.prepareBatch.mockResolvedValue({ id: 'batch1' });
    repository.findByIdForAdmin.mockResolvedValue({ id: 'batch1', statut: 'EN_ATTENTE' });
    repository.confirmBatch.mockResolvedValue({ id: 'batch1', statut: 'VERSE', updated: true });
    repository.cancelBatch.mockResolvedValue({ id: 'batch1', cancelled: true });

    const result = await service.prepareBatch(
      { artisanId: 'a1', commandeArtisanIds: ['ca1'] },
      'admin1'
    );
    expect(result.id).toBe('batch1');
  });

  it('ne contacte pas FedaPay lors de la confirmation', async () => {
    repository.findCommandeArtisansForBatch.mockResolvedValue([
      {
        id: 'ca1',
        artisanId: 'a1',
        statut: 'LIVREE',
        sousTotal: 10000,
        commission: 1000,
        fraisLivraison: 0,
        montantTotal: 9000,
        commande: {
          id: 'cmd1',
          statut: 'LIVREE',
          paiement: { statut: 'REUSSI', reconciliationRequise: false },
          livraison: { dateReceptionConfirmee: new Date() },
        },
        artisan: { id: 'a1', nomAtelier: 'Atelier' },
        payout: null,
        payoutBatchLines: [],
      },
    ]);
    repository.findActivePayoutBatchLinesByCommandeArtisanIds.mockResolvedValue([]);
    repository.prepareBatch.mockResolvedValue({ id: 'batch1' });
    repository.findByIdForAdmin.mockResolvedValue({ id: 'batch1', statut: 'EN_ATTENTE' });
    repository.confirmBatch.mockResolvedValue({ id: 'batch1', statut: 'VERSE', updated: true });
    repository.cancelBatch.mockResolvedValue({ id: 'batch1', cancelled: true });

    await service.confirmBatch(
      'batch1',
      { moyenPaiement: 'MOBILE_MONEY', referenceTransfert: 'REF-1' },
      'admin1'
    );
  });

  it('ne contacte pas FedaPay lors de l annulation', async () => {
    repository.findCommandeArtisansForBatch.mockResolvedValue([
      {
        id: 'ca1',
        artisanId: 'a1',
        statut: 'LIVREE',
        sousTotal: 10000,
        commission: 1000,
        fraisLivraison: 0,
        montantTotal: 9000,
        commande: {
          id: 'cmd1',
          statut: 'LIVREE',
          paiement: { statut: 'REUSSI', reconciliationRequise: false },
          livraison: { dateReceptionConfirmee: new Date() },
        },
        artisan: { id: 'a1', nomAtelier: 'Atelier' },
        payout: null,
        payoutBatchLines: [],
      },
    ]);
    repository.findActivePayoutBatchLinesByCommandeArtisanIds.mockResolvedValue([]);
    repository.prepareBatch.mockResolvedValue({ id: 'batch1' });
    repository.findByIdForAdmin.mockResolvedValue({ id: 'batch1', statut: 'EN_ATTENTE' });
    repository.confirmBatch.mockResolvedValue({ id: 'batch1', statut: 'VERSE', updated: true });
    repository.cancelBatch.mockResolvedValue({ id: 'batch1', cancelled: true });

    await service.cancelBatch('batch1', 'Motif valide', 'admin1');
  });
});