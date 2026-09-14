import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderService } from '../../src/modules/orders/order.service.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../src/common/errors/AppError.js';

const OEUVRE_A1 = '123e4567-e89b-12d3-a456-426614174000';
const OEUVRE_A2 = '123e4567-e89b-12d3-a456-426614174001';
const OEUVRE_B1 = '123e4567-e89b-12d3-a456-426614174002';
const ARTISAN_A = '123e4567-e89b-12d3-a456-426614174111';
const ARTISAN_B = '123e4567-e89b-12d3-a456-426614174222';

function makeOeuvre(overrides: Record<string, unknown> = {}) {
  return {
    id: OEUVRE_A1,
    artisanId: ARTISAN_A,
    statut: 'PUBLIEE',
    titre: 'Sculpture',
    prixXOF: 10000,
    artisan: { id: ARTISAN_A, commission: 10 },
    ...overrides,
  };
}

function buildService(overrides = {}) {
  const repository = {
    findBuyerProfileByUserId: vi.fn(),
    findOeuvreById: vi.fn(),
    createCommande: vi.fn(),
    findByIdMine: vi.fn(),
    findForAcheteur: vi.fn(),
    findByIdDetailed: vi.fn(),
    findByIdSummary: vi.fn(),
    findForAdmin: vi.fn(),
    updateStatut: vi.fn(),
    releaseOeuvres: vi.fn(),
    ...overrides,
  } as any;
  return { service: new OrderService(repository), repository };
}

const validInput = {
  articles: [{ oeuvreId: OEUVRE_A1, quantite: 1 }],
  adresseLivraison: 'Lomé, Tokoin',
  transporteur: 'DHL',
  fraisLivraison: 1000,
  methodePaiement: 'MOBILE_MONEY',
};

// ---------------------------------------------------------------------------
// A. Commande avec un seul artisan → une CommandeArtisan
// ---------------------------------------------------------------------------
describe('CommandeArtisan: single artisan order', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates exactly one CommandeArtisan for a single-artisan order', async () => {
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue({ id: 'bp-1' });
    repository.findOeuvreById.mockResolvedValue(makeOeuvre());
    repository.createCommande.mockResolvedValue({ id: 'cmd-1' });
    repository.findByIdMine.mockResolvedValue({ id: 'cmd-1' });

    await service.createCommande('user-1', validInput);

    const call = repository.createCommande.mock.calls[0]![0];
    expect(call.commandesArtisans).toHaveLength(1);
    expect(call.commandesArtisans[0]!.artisanId).toBe(ARTISAN_A);
  });

  it('attaches the single line to the single CommandeArtisan', async () => {
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue({ id: 'bp-1' });
    repository.findOeuvreById.mockResolvedValue(makeOeuvre());
    repository.createCommande.mockResolvedValue({ id: 'cmd-1' });
    repository.findByIdMine.mockResolvedValue({ id: 'cmd-1' });

    await service.createCommande('user-1', validInput);

    const call = repository.createCommande.mock.calls[0]![0];
    const ca = call.commandesArtisans[0]!;
    expect(ca.lignes).toHaveLength(1);
    expect(ca.lignes[0]!.oeuvreId).toBe(OEUVRE_A1);
  });
});

// ---------------------------------------------------------------------------
// B. Commande avec deux artisans → deux CommandeArtisan
// ---------------------------------------------------------------------------
describe('CommandeArtisan: two artisan order', () => {
  beforeEach(() => vi.clearAllMocks());

  it('creates two CommandeArtisan entries for two different artisans', async () => {
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue({ id: 'bp-1' });
    repository.findOeuvreById
      .mockResolvedValueOnce(makeOeuvre({ id: OEUVRE_A1, artisanId: ARTISAN_A }))
      .mockResolvedValueOnce(makeOeuvre({ id: OEUVRE_B1, artisanId: ARTISAN_B, artisan: { id: ARTISAN_B, commission: 15 } }));
    repository.createCommande.mockResolvedValue({ id: 'cmd-1' });
    repository.findByIdMine.mockResolvedValue({ id: 'cmd-1' });

    const input = {
      ...validInput,
      articles: [
        { oeuvreId: OEUVRE_A1, quantite: 1 },
        { oeuvreId: OEUVRE_B1, quantite: 1 },
      ],
    };

    await service.createCommande('user-1', input);

    const call = repository.createCommande.mock.calls[0]![0];
    expect(call.commandesArtisans).toHaveLength(2);
    const artisanIds = call.commandesArtisans.map((ca: any) => ca.artisanId);
    expect(artisanIds).toContain(ARTISAN_A);
    expect(artisanIds).toContain(ARTISAN_B);
  });
});

// ---------------------------------------------------------------------------
// C. Trois œuvres : 2 chez artisan A, 1 chez artisan B
// ---------------------------------------------------------------------------
describe('CommandeArtisan: three artworks two artisans grouping', () => {
  beforeEach(() => vi.clearAllMocks());

  it('groups 2 lines under artisan A and 1 line under artisan B', async () => {
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue({ id: 'bp-1' });
    repository.findOeuvreById
      .mockResolvedValueOnce(makeOeuvre({ id: OEUVRE_A1, artisanId: ARTISAN_A }))
      .mockResolvedValueOnce(makeOeuvre({ id: OEUVRE_A2, artisanId: ARTISAN_A }))
      .mockResolvedValueOnce(makeOeuvre({ id: OEUVRE_B1, artisanId: ARTISAN_B, artisan: { id: ARTISAN_B, commission: 15 } }));
    repository.createCommande.mockResolvedValue({ id: 'cmd-1' });
    repository.findByIdMine.mockResolvedValue({ id: 'cmd-1' });

    const input = {
      ...validInput,
      articles: [
        { oeuvreId: OEUVRE_A1, quantite: 1 },
        { oeuvreId: OEUVRE_A2, quantite: 2 },
        { oeuvreId: OEUVRE_B1, quantite: 1 },
      ],
    };

    await service.createCommande('user-1', input);

    const call = repository.createCommande.mock.calls[0]![0];
    expect(call.commandesArtisans).toHaveLength(2);

    const caA = call.commandesArtisans.find((ca: any) => ca.artisanId === ARTISAN_A);
    const caB = call.commandesArtisans.find((ca: any) => ca.artisanId === ARTISAN_B);

    expect(caA).toBeDefined();
    expect(caA.lignes).toHaveLength(2);
    expect(caA.lignes.map((l: any) => l.oeuvreId).sort()).toEqual([OEUVRE_A1, OEUVRE_A2].sort());

    expect(caB).toBeDefined();
    expect(caB.lignes).toHaveLength(1);
    expect(caB.lignes[0].oeuvreId).toBe(OEUVRE_B1);
  });
});

// ---------------------------------------------------------------------------
// D. Calcul du sous-total par artisan
// ---------------------------------------------------------------------------
describe('CommandeArtisan: sous-total per artisan', () => {
  beforeEach(() => vi.clearAllMocks());

  it('computes correct sousTotal for each artisan', async () => {
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue({ id: 'bp-1' });
    repository.findOeuvreById
      .mockResolvedValueOnce(makeOeuvre({ id: OEUVRE_A1, artisanId: ARTISAN_A, prixXOF: 10000 }))
      .mockResolvedValueOnce(makeOeuvre({ id: OEUVRE_A2, artisanId: ARTISAN_A, prixXOF: 15000 }))
      .mockResolvedValueOnce(makeOeuvre({ id: OEUVRE_B1, artisanId: ARTISAN_B, prixXOF: 20000, artisan: { id: ARTISAN_B, commission: 10 } }));
    repository.createCommande.mockResolvedValue({ id: 'cmd-1' });
    repository.findByIdMine.mockResolvedValue({ id: 'cmd-1' });

    const input = {
      ...validInput,
      articles: [
        { oeuvreId: OEUVRE_A1, quantite: 1 },
        { oeuvreId: OEUVRE_A2, quantite: 1 },
        { oeuvreId: OEUVRE_B1, quantite: 1 },
      ],
      fraisLivraison: 0,
    };

    await service.createCommande('user-1', input);

    const call = repository.createCommande.mock.calls[0]![0];
    const caA = call.commandesArtisans.find((ca: any) => ca.artisanId === ARTISAN_A);
    const caB = call.commandesArtisans.find((ca: any) => ca.artisanId === ARTISAN_B);

    expect(caA.sousTotal).toBe(25000);
    expect(caB.sousTotal).toBe(20000);
  });
});

// ---------------------------------------------------------------------------
// E. Calcul de la commission par artisan
// ---------------------------------------------------------------------------
describe('CommandeArtisan: commission per artisan', () => {
  beforeEach(() => vi.clearAllMocks());

  it('computes correct commission for each artisan based on their own rate', async () => {
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue({ id: 'bp-1' });
    repository.findOeuvreById
      .mockResolvedValueOnce(makeOeuvre({ id: OEUVRE_A1, artisanId: ARTISAN_A, prixXOF: 10000, artisan: { id: ARTISAN_A, commission: 10 } }))
      .mockResolvedValueOnce(makeOeuvre({ id: OEUVRE_B1, artisanId: ARTISAN_B, prixXOF: 20000, artisan: { id: ARTISAN_B, commission: 20 } }));
    repository.createCommande.mockResolvedValue({ id: 'cmd-1' });
    repository.findByIdMine.mockResolvedValue({ id: 'cmd-1' });

    const input = {
      ...validInput,
      articles: [
        { oeuvreId: OEUVRE_A1, quantite: 1 },
        { oeuvreId: OEUVRE_B1, quantite: 1 },
      ],
      fraisLivraison: 0,
    };

    await service.createCommande('user-1', input);

    const call = repository.createCommande.mock.calls[0]![0];
    const caA = call.commandesArtisans.find((ca: any) => ca.artisanId === ARTISAN_A);
    const caB = call.commandesArtisans.find((ca: any) => ca.artisanId === ARTISAN_B);

    expect(caA.commission).toBe(1000);
    expect(caB.commission).toBe(4000);
    expect(call.commission).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// F. Montant global = somme correcte
// ---------------------------------------------------------------------------
describe('CommandeArtisan: global total = sum of subtotals + fees', () => {
  beforeEach(() => vi.clearAllMocks());

  it('global montantTotal matches sum of artisan montantTotals', async () => {
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue({ id: 'bp-1' });
    repository.findOeuvreById
      .mockResolvedValueOnce(makeOeuvre({ id: OEUVRE_A1, artisanId: ARTISAN_A, prixXOF: 10000 }))
      .mockResolvedValueOnce(makeOeuvre({ id: OEUVRE_B1, artisanId: ARTISAN_B, prixXOF: 20000, artisan: { id: ARTISAN_B, commission: 10 } }));
    repository.createCommande.mockResolvedValue({ id: 'cmd-1' });
    repository.findByIdMine.mockResolvedValue({ id: 'cmd-1' });

    const input = {
      ...validInput,
      articles: [
        { oeuvreId: OEUVRE_A1, quantite: 1 },
        { oeuvreId: OEUVRE_B1, quantite: 1 },
      ],
      fraisLivraison: 5000,
    };

    await service.createCommande('user-1', input);

    const call = repository.createCommande.mock.calls[0]![0];

    expect(call.sousTotal).toBe(30000);
    expect(call.montantTotal).toBe(35000);

    const sumArtisanMontants = call.commandesArtisans.reduce(
      (sum: number, ca: any) => sum + ca.montantTotal,
      0
    );
    expect(sumArtisanMontants).toBe(35000);

    const sumArtisanFrais = call.commandesArtisans.reduce(
      (sum: number, ca: any) => sum + ca.fraisLivraison,
      0
    );
    expect(sumArtisanFrais).toBe(5000);
  });
});

// ---------------------------------------------------------------------------
// G. Œuvre déjà vendue → refus
// ---------------------------------------------------------------------------
describe('CommandeArtisan: already sold artwork', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects creation when an artwork is already VENDUE', async () => {
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue({ id: 'bp-1' });
    repository.findOeuvreById.mockResolvedValue(
      makeOeuvre({ statut: 'VENDUE' })
    );

    await expect(
      service.createCommande('user-1', validInput)
    ).rejects.toThrow(ConflictError);
    expect(repository.createCommande).not.toHaveBeenCalled();
  });

  it('rejects creation when a concurrent purchase makes an artwork unavailable', async () => {
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue({ id: 'bp-1' });
    repository.findOeuvreById.mockResolvedValue(makeOeuvre());
    repository.createCommande.mockRejectedValue(
      new Error(`CONCURRENT_PURCHASE:${OEUVRE_A1}`)
    );

    await expect(
      service.createCommande('user-1', validInput)
    ).rejects.toThrow(ConflictError);
  });
});

// ---------------------------------------------------------------------------
// H. Concurrence atomique
// ---------------------------------------------------------------------------
describe('CommandeArtisan: concurrent purchase protection', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rolls back the entire transaction when atomic reservation fails', async () => {
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue({ id: 'bp-1' });
    repository.findOeuvreById.mockResolvedValue(makeOeuvre());
    repository.createCommande.mockRejectedValue(
      new Error(`CONCURRENT_PURCHASE:${OEUVRE_A1}`)
    );

    await expect(
      service.createCommande('user-1', validInput)
    ).rejects.toThrow(ConflictError);

    expect(repository.createCommande).toHaveBeenCalledTimes(1);
    expect(repository.findByIdMine).not.toHaveBeenCalled();
  });

  it('succeeds when the repository transaction succeeds (no concurrency issue)', async () => {
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue({ id: 'bp-1' });
    repository.findOeuvreById.mockResolvedValue(makeOeuvre());
    repository.createCommande.mockResolvedValue({ id: 'cmd-1' });
    repository.findByIdMine.mockResolvedValue({ id: 'cmd-1' });

    const result = await service.createCommande('user-1', validInput);
    expect(result.commande).toBeDefined();
    expect(result.commande!.id).toBe('cmd-1');
  });
});

// ---------------------------------------------------------------------------
// I. Rétrocompatibilité avec les anciennes commandes
// ---------------------------------------------------------------------------
describe('CommandeArtisan: backward compatibility for old orders', () => {
  beforeEach(() => vi.clearAllMocks());

  it('old orders without commandesArtisans are still accessible via getMyCommande', async () => {
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue({ id: 'bp-1' });
    repository.findByIdMine.mockResolvedValue({
      id: 'cmd-old',
      statut: 'LIVREE',
      lignesCommande: [
        { id: 'lc-1', prixUnitaire: 5000, quantite: 1 },
      ],
      commandesArtisans: [],
    });

    const result = await service.getMyCommande('user-1', 'cmd-old');
    expect(result.id).toBe('cmd-old');
    expect(result.commandesArtisans).toEqual([]);
  });

  it('old orders without commandesArtisans are still accessible via getCommandeAdmin', async () => {
    const { service, repository } = buildService();
    repository.findByIdDetailed.mockResolvedValue({
      id: 'cmd-old',
      statut: 'LIVREE',
      commandesArtisans: [],
    });

    const result = await service.getCommandeAdmin('cmd-old');
    expect(result.id).toBe('cmd-old');
  });

  it('old orders are listed for admin without errors', async () => {
    const { service, repository } = buildService();
    repository.findForAdmin.mockResolvedValue({
      commandes: [
        {
          id: 'cmd-old',
          statut: 'LIVREE',
          commandesArtisans: [],
          lignesCommande: [
            { id: 'lc-1', commandeArtisanId: null },
          ],
        },
      ],
      total: 1,
    });

    const result = await service.getAllAdmin(1, 20, {});
    expect(result.commandes).toHaveLength(1);
  });

  it('old orders are listed for acheteur without errors', async () => {
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue({ id: 'bp-1' });
    repository.findForAcheteur.mockResolvedValue({
      commandes: [
        {
          id: 'cmd-old',
          statut: 'LIVREE',
          commandesArtisans: [],
          lignesCommande: [
            { id: 'lc-1', commandeArtisanId: null },
          ],
        },
      ],
      total: 1,
    });

    const result = await service.getMyCommandes('user-1', 1, 20);
    expect(result.commandes).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// J. Transitions de statut
// ---------------------------------------------------------------------------
describe('CommandeArtisan: existing status transitions still work', () => {
  beforeEach(() => vi.clearAllMocks());

  it('COMMANDE → PREPARATION is still valid', async () => {
    const { service, repository } = buildService();
    repository.findByIdSummary.mockResolvedValue({
      id: 'cmd-1',
      statut: 'COMMANDE',
      acheteurId: 'bp-1',
    });
    repository.updateStatut.mockResolvedValue({ id: 'cmd-1', statut: 'PREPARATION' });

    const result = await service.updateStatut('cmd-1', 'PREPARATION');
    expect(result.statut).toBe('PREPARATION');
  });

  it('annulation from COMMANDE still works', async () => {
    const { service, repository } = buildService();
    repository.findByIdSummary.mockResolvedValue({ id: 'cmd-1', statut: 'COMMANDE' });
    repository.updateStatut.mockResolvedValue({ id: 'cmd-1', statut: 'ANNULEE' });

    const result = await service.annuler('cmd-1');
    expect(result.statut).toBe('ANNULEE');
  });
});

// ---------------------------------------------------------------------------
// K. Prix toujours côté serveur
// ---------------------------------------------------------------------------
describe('CommandeArtisan: server-side price derivation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ignores any price from the client and uses server-side price', async () => {
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue({ id: 'bp-1' });
    repository.findOeuvreById.mockResolvedValue(makeOeuvre({ prixXOF: 50000 }));
    repository.createCommande.mockResolvedValue({ id: 'cmd-1' });
    repository.findByIdMine.mockResolvedValue({ id: 'cmd-1' });

    await service.createCommande('user-1', validInput);

    const call = repository.createCommande.mock.calls[0]![0];
    expect(call.lignes[0].prixUnitaire).toBe(50000);
    expect(call.montantTotal).toBe(50000 + validInput.fraisLivraison);
  });
});

// ---------------------------------------------------------------------------
// L. Transaction rollback complet (aucune donnée partielle)
// ---------------------------------------------------------------------------
describe('OrderService: complete transaction rollback on failure', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not call findByIdMine when createCommande throws CONCURRENT_PURCHASE', async () => {
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue({ id: 'bp-1' });
    repository.findOeuvreById.mockResolvedValue(makeOeuvre());
    repository.createCommande.mockRejectedValue(
      new Error(`CONCURRENT_PURCHASE:${OEUVRE_A1}`)
    );

    await expect(
      service.createCommande('user-1', validInput)
    ).rejects.toThrow(ConflictError);
    expect(repository.findByIdMine).not.toHaveBeenCalled();
  });

  it('does not create any partial data when reservation fails (CONCURRENT_PURCHASE)', async () => {
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue({ id: 'bp-1' });
    repository.findOeuvreById.mockResolvedValue(makeOeuvre());
    repository.createCommande.mockRejectedValue(
      new Error(`CONCURRENT_PURCHASE:${OEUVRE_A1}`)
    );

    try {
      await service.createCommande('user-1', validInput);
    } catch {
      // expected
    }

    expect(repository.createCommande).toHaveBeenCalledTimes(1);
    expect(repository.findByIdMine).not.toHaveBeenCalled();
    expect(repository.updateStatut).not.toHaveBeenCalled();
  });
});
