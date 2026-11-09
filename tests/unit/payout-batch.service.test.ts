import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PayoutBatchService } from '../../src/modules/payouts/payout-batch.service.js';

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

function eligibleRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'ca1',
    statut: 'LIVREE',
    artisanId: 'a1',
    commandeId: 'cmd1',
    sousTotal: 10000,
    commission: 1000,
    fraisLivraison: 0,
    montantTotal: 9000,
    updatedAt: new Date(),
    commande: {
      id: 'cmd1',
      statut: 'LIVREE',
      dateCreation: new Date(),
      paiement: { statut: 'REUSSI', reconciliationRequise: false, devise: 'XOF' },
      livraison: { statut: 'LIVREE', dateReceptionConfirmee: new Date() },
    },
    artisan: { id: 'a1', nomAtelier: 'Atelier', user: { nom: 'Ali' } },
    ...overrides,
  };
}

const service = new PayoutBatchService(repository as any);

describe('PayoutBatchService', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('prepares batch with multiple commandes for same artisan', async () => {
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
      {
        id: 'ca2',
        artisanId: 'a1',
        statut: 'LIVREE',
        sousTotal: 5000,
        commission: 500,
        fraisLivraison: 0,
        montantTotal: 4500,
        commande: {
          id: 'cmd2',
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

    const result = await service.prepareBatch({ artisanId: 'a1', commandeArtisanIds: ['ca1', 'ca2'] }, 'admin1');
    expect(result.id).toBe('batch1');
    expect(repository.prepareBatch).toHaveBeenCalled();
  });

  it('refuses if commandes belong to different artisans', async () => {
    repository.findCommandeArtisansForBatch.mockResolvedValue([
      {
        id: 'ca1',
        artisanId: 'a1',
        statut: 'LIVREE',
        sousTotal: 10000,
        commission: 1000,
        fraisLivraison: 0,
        montantTotal: 9000,
        commande: { id: 'cmd1', statut: 'LIVREE', paiement: { statut: 'REUSSI', reconciliationRequise: false }, livraison: { dateReceptionConfirmee: new Date() } },
        artisan: { id: 'a1', nomAtelier: 'Atelier' },
        payout: null,
        payoutBatchLines: [],
      },
      {
        id: 'ca2',
        artisanId: 'a2',
        statut: 'LIVREE',
        sousTotal: 5000,
        commission: 500,
        fraisLivraison: 0,
        montantTotal: 4500,
        commande: { id: 'cmd2', statut: 'LIVREE', paiement: { statut: 'REUSSI', reconciliationRequise: false }, livraison: { dateReceptionConfirmee: new Date() } },
        artisan: { id: 'a2', nomAtelier: 'Other' },
        payout: null,
        payoutBatchLines: [],
      },
    ]);
    repository.findActivePayoutBatchLinesByCommandeArtisanIds.mockResolvedValue([]);

    await expect(service.prepareBatch({ artisanId: 'a1', commandeArtisanIds: ['ca1', 'ca2'] }, 'admin1')).rejects.toThrow();
  });

  it('refuses double reservation (commande already reserved in EN_ATTENTE batch)', async () => {
    repository.findCommandeArtisansForBatch.mockResolvedValue([
      {
        id: 'ca1',
        artisanId: 'a1',
        statut: 'LIVREE',
        sousTotal: 10000,
        commission: 1000,
        fraisLivraison: 0,
        montantTotal: 9000,
        commande: { id: 'cmd1', statut: 'LIVREE', paiement: { statut: 'REUSSI', reconciliationRequise: false }, livraison: { dateReceptionConfirmee: new Date() } },
        artisan: { id: 'a1', nomAtelier: 'Atelier' },
        payout: null,
        payoutBatchLines: [],
      },
    ]);
    repository.findActivePayoutBatchLinesByCommandeArtisanIds.mockResolvedValue([
      {
        id: 'line1',
        commandeArtisanId: 'ca1',
        payoutBatch: { id: 'b1', statut: 'EN_ATTENTE' },
      },
    ]);

    await expect(service.prepareBatch({ artisanId: 'a1', commandeArtisanIds: ['ca1'] }, 'admin1')).rejects.toThrow();
  });

  it('allows reuse after annulation', async () => {
    repository.findCommandeArtisansForBatch.mockResolvedValue([
      {
        id: 'ca1',
        artisanId: 'a1',
        statut: 'LIVREE',
        sousTotal: 10000,
        commission: 1000,
        fraisLivraison: 0,
        montantTotal: 9000,
        commande: { id: 'cmd1', statut: 'LIVREE', paiement: { statut: 'REUSSI', reconciliationRequise: false }, livraison: { dateReceptionConfirmee: new Date() } },
        artisan: { id: 'a1', nomAtelier: 'Atelier' },
        payout: null,
        payoutBatchLines: [{ id: 'line1', payoutBatchId: 'b1' }],
      },
    ]);
    repository.findActivePayoutBatchLinesByCommandeArtisanIds.mockResolvedValue([]);
    repository.prepareBatch.mockResolvedValue({ id: 'batch2' });

    const result = await service.prepareBatch({ artisanId: 'a1', commandeArtisanIds: ['ca1'] }, 'admin1');
    expect(result.id).toBe('batch2');
  });

  it('refuses if commande already paid (VERSE batch)', async () => {
    repository.findCommandeArtisansForBatch.mockResolvedValue([
      {
        id: 'ca1',
        artisanId: 'a1',
        statut: 'LIVREE',
        sousTotal: 10000,
        commission: 1000,
        fraisLivraison: 0,
        montantTotal: 9000,
        commande: { id: 'cmd1', statut: 'LIVREE', paiement: { statut: 'REUSSI', reconciliationRequise: false }, livraison: { dateReceptionConfirmee: new Date() } },
        artisan: { id: 'a1', nomAtelier: 'Atelier' },
        payout: null,
        payoutBatchLines: [],
      },
    ]);
    repository.findActivePayoutBatchLinesByCommandeArtisanIds.mockResolvedValue([
      {
        id: 'line1',
        commandeArtisanId: 'ca1',
        payoutBatch: { id: 'b1', statut: 'VERSE' },
      },
    ]);

    await expect(service.prepareBatch({ artisanId: 'a1', commandeArtisanIds: ['ca1'] }, 'admin1')).rejects.toThrow();
  });

  it('groups eligible commandes by artisan with net totals', async () => {
    repository.findEligibleGrouped.mockResolvedValue({
      rows: [
        eligibleRow({ id: 'ca1', artisanId: 'a1', sousTotal: 10000, commission: 1000 }),
        eligibleRow({
          id: 'ca2',
          artisanId: 'a1',
          commandeId: 'cmd2',
          sousTotal: 5000,
          commission: 500,
        }),
        eligibleRow({
          id: 'ca3',
          artisanId: 'a2',
          commandeId: 'cmd3',
          sousTotal: 20000,
          commission: 2000,
          artisan: { id: 'a2', nomAtelier: 'Autre', user: { nom: 'Bola' } },
        }),
      ],
      total: 2,
    });

    const result = await service.listEligibleGrouped({ page: 1, limit: 20 });
    expect(result.artisans).toHaveLength(2);
    expect(result.artisans[0]).toMatchObject({
      artisan: { id: 'a1' },
      montantNetTotal: 13500,
    });
    expect(result.artisans[0].commandes).toHaveLength(2);
    expect(result.artisans[1]).toMatchObject({ artisan: { id: 'a2' }, montantNetTotal: 18000 });
    expect(result.total).toBe(2);
  });

  it('lists only commandes passing eligibility in grouped view', async () => {
    repository.findEligibleGrouped.mockResolvedValue({
      rows: [
        eligibleRow({
          id: 'ca1',
          commande: {
            id: 'cmd1',
            statut: 'LIVREE',
            dateCreation: new Date(),
            paiement: { statut: 'REUSSI', reconciliationRequise: false, devise: 'XOF' },
            livraison: { statut: 'LIVREE', dateReceptionConfirmee: null },
          },
        }),
      ],
      total: 1,
    });

    const result = await service.listEligibleGrouped({ page: 1, limit: 20 });
    expect(result.artisans[0].commandes[0]).toMatchObject({ eligible: false });
    expect(result.artisans[0].commandes[0].raisons).toContain('RECEPTION_NON_CONFIRMEE');
  });

  it('confirms an EN_ATTENTE batch', async () => {
    repository.findByIdForAdmin.mockResolvedValue({ id: 'b1', statut: 'EN_ATTENTE' });
    repository.confirmBatch.mockResolvedValue({ id: 'b1', statut: 'VERSE', updated: true });

    const result = await service.confirmBatch(
      'b1',
      { moyenPaiement: 'MOBILE_MONEY', referenceTransfert: 'REF-1' },
      'admin1'
    );
    expect(result).toEqual({ id: 'b1', statut: 'VERSE' });
  });

  it('refuses a second (concurrent) confirmation', async () => {
    repository.findByIdForAdmin.mockResolvedValue({ id: 'b1', statut: 'EN_ATTENTE' });
    repository.confirmBatch.mockResolvedValue({ id: 'b1', statut: 'VERSE', updated: false });

    await expect(
      service.confirmBatch(
        'b1',
        { moyenPaiement: 'VIREMENT_BANCAIRE', referenceTransfert: 'REF-2' },
        'admin1'
      )
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('refuses to confirm a batch that is not EN_ATTENTE', async () => {
    repository.findByIdForAdmin.mockResolvedValue({ id: 'b1', statut: 'VERSE' });
    await expect(
      service.confirmBatch('b1', { moyenPaiement: 'MOBILE_MONEY', referenceTransfert: 'REF-3' }, 'admin1')
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('cancels an EN_ATTENTE batch', async () => {
    repository.findByIdForAdmin.mockResolvedValue({ id: 'b1', statut: 'EN_ATTENTE' });
    repository.cancelBatch.mockResolvedValue({ id: 'b1', cancelled: true });

    const result = await service.cancelBatch('b1', 'Erreur de selection', 'admin1');
    expect(result).toEqual({ id: 'b1' });
  });

  it('refuses a concurrent cancellation', async () => {
    repository.findByIdForAdmin.mockResolvedValue({ id: 'b1', statut: 'EN_ATTENTE' });
    repository.cancelBatch.mockResolvedValue({ id: 'b1', cancelled: false });

    await expect(service.cancelBatch('b1', 'Motif valide', 'admin1')).rejects.toMatchObject({
      statusCode: 409,
    });
  });
});
