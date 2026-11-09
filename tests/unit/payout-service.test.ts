import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PayoutService } from '../../src/modules/payouts/payout.service.js';
import type { PayoutRepository } from '../../src/modules/payouts/payout.repository.js';
import { ConflictError, NotFoundError, ValidationError } from '../../src/common/errors/AppError.js';

const COMMANDE_ARTISAN_ID = '11111111-1111-4111-8111-111111111111';
const PAYOUT_ID = '22222222-2222-4222-8222-222222222222';

function buildRow(overrides: Record<string, unknown> = {}) {
  return {
    id: COMMANDE_ARTISAN_ID,
    statut: 'LIVREE',
    artisanId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    commandeId: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
    sousTotal: 10_000,
    commission: 1_000,
    fraisLivraison: 0,
    montantTotal: 10_000,
    commande: {
      id: 'cccccccc-cccc-cccc-cccc-cccccccccccc',
      statut: 'LIVREE',
      paiement: { statut: 'REUSSI', reconciliationRequise: false, devise: 'XOF' },
      livraison: { dateReceptionConfirmee: new Date('2026-10-01T10:00:00.000Z') },
    },
    artisan: {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      nomAtelier: 'Atelier Test',
      commission: 1_000,
      user: { nom: 'Awa Ndiaye', email: 'awa@example.com', telephone: '+22997000000' },
      paiementPreference: {
        methode: 'MOBILE_MONEY',
        mobileMoneyNumero: '+22997000000',
        mobileMoneyOperateur: 'MTN',
        virementNomBanque: null,
        virementIban: null,
        virementNomCompte: null,
      },
    },
    payout: null,
    ...overrides,
  };
}

function buildRepository() {
  return {
    findCommandeArtisanForPayout: vi.fn(),
    findPayoutByCommandeArtisanId: vi.fn(),
    findPayoutById: vi.fn(),
    countTentatives: vi.fn().mockResolvedValue(0),
    createPayout: vi.fn(),
    markPayoutEnTraitement: vi.fn().mockResolvedValue(undefined),
    markPayoutVerseLocal: vi.fn().mockResolvedValue(undefined),
    markPayoutEchoueLocal: vi.fn().mockResolvedValue(undefined),
    findManyForAdmin: vi.fn(),
    findByIdForAdmin: vi.fn(),
    findEligibleCommandeArtisans: vi.fn(),
  };
}

function buildService() {
  const repository = buildRepository();
  const service = new PayoutService(repository as unknown as PayoutRepository);
  return { service, repository };
}

describe('PayoutService (Manual Payouts)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('reports a missing sub-order when triggering payout', async () => {
    const { service, repository } = buildService();
    repository.findCommandeArtisanForPayout.mockResolvedValue(null);

    await expect(service.declencherPayout(COMMANDE_ARTISAN_ID, 'admin')).rejects.toBeInstanceOf(
      NotFoundError
    );
  });

  it('creates and marks a manual payout in treatment locally', async () => {
    const { service, repository } = buildService();
    repository.findCommandeArtisanForPayout.mockResolvedValue(buildRow());
    repository.findPayoutByCommandeArtisanId.mockResolvedValue(null);
    repository.createPayout.mockResolvedValue({ id: PAYOUT_ID });

    const result = await service.declencherPayout(COMMANDE_ARTISAN_ID, 'admin');

    expect(repository.createPayout).toHaveBeenCalledWith(
      expect.objectContaining({ commandeArtisanId: COMMANDE_ARTISAN_ID, montantNet: 9_000, devise: 'XOF' })
    );
    expect(repository.markPayoutEnTraitement).toHaveBeenCalled();
    expect(result).toMatchObject({ payoutId: PAYOUT_ID, statut: 'EN_TRAITEMENT', montantNet: 9_000 });
  });

  it('resumes an existing EN_ATTENTE payout without creating a new one', async () => {
    const { service, repository } = buildService();
    repository.findCommandeArtisanForPayout.mockResolvedValue(buildRow());
    repository.findPayoutByCommandeArtisanId.mockResolvedValue({
      id: PAYOUT_ID,
      statut: 'EN_ATTENTE',
      referenceExterne: null,
    });

    const result = await service.declencherPayout(COMMANDE_ARTISAN_ID, 'admin');

    expect(repository.createPayout).not.toHaveBeenCalled();
    expect(result.payoutId).toBe(PAYOUT_ID);
  });

  it('conflicts when a payout already exists in a non-resumable state', async () => {
    const { service, repository } = buildService();
    repository.findCommandeArtisanForPayout.mockResolvedValue(buildRow());
    repository.findPayoutByCommandeArtisanId.mockResolvedValue({
      id: PAYOUT_ID,
      statut: 'EN_TRAITEMENT',
      referenceExterne: 'MANUAL-1',
    });

    await expect(service.declencherPayout(COMMANDE_ARTISAN_ID, 'admin')).rejects.toBeInstanceOf(
      ConflictError
    );
    expect(repository.createPayout).not.toHaveBeenCalled();
  });

  it('translates a unique constraint violation into a conflict', async () => {
    const { service, repository } = buildService();
    repository.findCommandeArtisanForPayout.mockResolvedValue(buildRow());
    repository.findPayoutByCommandeArtisanId.mockResolvedValue(null);
    repository.createPayout.mockRejectedValue(new Error('P2002: Unique constraint'));

    await expect(service.declencherPayout(COMMANDE_ARTISAN_ID, 'admin')).rejects.toBeInstanceOf(
      ConflictError
    );
  });

  it('requires artisan name and email before marking in treatment', async () => {
    const { service, repository } = buildService();
    repository.findCommandeArtisanForPayout.mockResolvedValue(
      buildRow({
        artisan: { ...buildRow().artisan, user: { nom: '', email: null, telephone: '+22997000000' } },
      })
    );
    repository.findPayoutByCommandeArtisanId.mockResolvedValue(null);
    repository.createPayout.mockResolvedValue({ id: PAYOUT_ID });

    await expect(service.declencherPayout(COMMANDE_ARTISAN_ID, 'admin')).rejects.toBeInstanceOf(
      ValidationError
    );
  });
});
