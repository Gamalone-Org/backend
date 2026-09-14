import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderRepository } from '../../src/modules/orders/order.repository.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createTransactionMock() {
  return {
    $executeRaw: vi.fn(),
    commande: {
      create: vi.fn(),
    },
    oeuvre: {
      updateMany: vi.fn(),
    },
    commandeArtisan: {
      create: vi.fn(),
    },
    ligneCommande: {
      create: vi.fn(),
    },
  } as any;
}

function buildRepository(mockTx = createTransactionMock()) {
  const prisma = {
    $transaction: vi.fn(async (callback: (client: any) => Promise<unknown>) =>
      callback(mockTx)
    ),
  };
  const repository = new OrderRepository(prisma as any);
  return { repository, prisma, mockTx };
}

const OEUVRE_1 = '123e4567-e89b-12d3-a456-426614174000';
const OEUVRE_2 = '123e4567-e89b-12d3-a456-426614174001';
const ARTISAN_1 = '123e4567-e89b-12d3-a456-426614174111';
const ARTISAN_2 = '123e4567-e89b-12d3-a456-426614174222';

const data = {
  acheteurId: 'buyer-1',
  lignes: [
    { oeuvreId: OEUVRE_1, artisanId: ARTISAN_1, prixUnitaire: 10000, quantite: 2 },
    { oeuvreId: OEUVRE_2, artisanId: ARTISAN_2, prixUnitaire: 5000, quantite: 1 },
  ],
  commandesArtisans: [
    {
      artisanId: ARTISAN_1,
      statut: 'COMMANDE' as const,
      sousTotal: 20000,
      commission: 2000,
      fraisLivraison: 1500,
      montantTotal: 21500,
      lignes: [
        { oeuvreId: OEUVRE_1, artisanId: ARTISAN_1, prixUnitaire: 10000, quantite: 2 },
      ],
    },
    {
      artisanId: ARTISAN_2,
      statut: 'COMMANDE' as const,
      sousTotal: 5000,
      commission: 500,
      fraisLivraison: 1000,
      montantTotal: 6000,
      lignes: [
        { oeuvreId: OEUVRE_2, artisanId: ARTISAN_2, prixUnitaire: 5000, quantite: 1 },
      ],
    },
  ],
  sousTotal: 25000,
  fraisLivraison: 2500,
  montantTotal: 27500,
  commission: 2500,
  methodePaiement: 'MOBILE_MONEY' as const,
  adresseDest: 'Lomé, Tokoin',
  transporteur: 'DHL',
};

// ---------------------------------------------------------------------------
// A. Atomicité de la transaction
// ---------------------------------------------------------------------------
describe('OrderRepository.createCommande atomicity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates the order, its lines, payment and delivery in one transaction', async () => {
    const { repository, prisma, mockTx } = buildRepository();
    mockTx.$executeRaw.mockResolvedValue(2);
    mockTx.commande.create.mockResolvedValue({ id: 'cmd-1' });
    mockTx.commandeArtisan.create.mockResolvedValue({ id: 'ca-1' });
    mockTx.ligneCommande.create.mockResolvedValue({ id: 'lc-1' });
    mockTx.$executeRaw.mockResolvedValueOnce(2).mockResolvedValueOnce(undefined);

    const result = await repository.createCommande(data);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockTx.commande.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        acheteurId: 'buyer-1',
        montantTotal: 27500,
        commission: 2500,
        fraisLivraison: 2500,
      }),
    });
    expect(result.id).toBe('cmd-1');
  });

  it('uses atomic UPDATE to reserve artworks before creating the order', async () => {
    const { repository, mockTx } = buildRepository();
    mockTx.$executeRaw.mockResolvedValueOnce(2).mockResolvedValueOnce(undefined);
    mockTx.commande.create.mockResolvedValue({ id: 'cmd-1' });
    mockTx.commandeArtisan.create.mockResolvedValue({ id: 'ca-1' });
    mockTx.ligneCommande.create.mockResolvedValue({ id: 'lc-1' });

    await repository.createCommande(data);

    // Première requête : atomique UPDATE ... WHERE statut = 'PUBLIEE'
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(1);
    const firstCall = mockTx.$executeRaw.mock.calls[0]![0];
    expect(firstCall[0]).toContain('EN_PANIER');
    expect(firstCall.join('')).toContain('PUBLIEE');
  });

  it('rolls back the whole transaction when the commande creation fails', async () => {
    const { repository, prisma, mockTx } = buildRepository();
    mockTx.$executeRaw.mockResolvedValueOnce(2);
    mockTx.commande.create.mockRejectedValue(new Error('P2003'));

    await expect(repository.createCommande(data)).rejects.toThrow('P2003');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// B. Protection concurrence atomique
// ---------------------------------------------------------------------------
describe('OrderRepository.createCommande atomic purchase protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects purchase when an artwork is already EN_PANIER (concurrent reservation)', async () => {
    const { repository, mockTx } = buildRepository();
    // UPDATE ne matche que 1 œuvre sur 2 demandées (la 2e est déjà EN_PANIER)
    mockTx.$executeRaw.mockResolvedValueOnce(1);
    // Rollback partiel : remet l'œuvre réservée en PUBLIEE
    mockTx.$executeRaw.mockResolvedValueOnce(undefined);

    await expect(repository.createCommande(data)).rejects.toThrow('CONCURRENT_PURCHASE');
    expect(mockTx.commande.create).not.toHaveBeenCalled();
    expect(mockTx.oeuvre.updateMany).not.toHaveBeenCalled(); // Pas de passage VENDUE anticipé
  });

  it('rejects purchase when an artwork is VENDUE (concurrent purchase)', async () => {
    const { repository, mockTx } = buildRepository();
    // UPDATE ne matche aucune ligne (toutes VENDUE)
    mockTx.$executeRaw.mockResolvedValueOnce(0);

    await expect(repository.createCommande(data)).rejects.toThrow('CONCURRENT_PURCHASE');
    expect(mockTx.commande.create).not.toHaveBeenCalled();
  });

  it('rolls back partial reservation when one artwork is unavailable', async () => {
    const { repository, mockTx } = buildRepository();
    // 1 œuvre réservée, 1 échoue
    mockTx.$executeRaw.mockResolvedValueOnce(1);
    // Rollback partiel
    mockTx.$executeRaw.mockResolvedValueOnce(undefined);

    await expect(repository.createCommande(data)).rejects.toThrow('CONCURRENT_PURCHASE');
    // Le rollback partiel doit être appelé pour remettre l'œuvre réservée en PUBLIEE
    expect(mockTx.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it('creates CommandeArtisan entries for each artisan group', async () => {
    const { repository, mockTx } = buildRepository();
    mockTx.$executeRaw.mockResolvedValueOnce(2).mockResolvedValueOnce(undefined);
    mockTx.commande.create.mockResolvedValue({ id: 'cmd-1' });
    mockTx.commandeArtisan.create.mockResolvedValue({ id: 'ca-1' });
    mockTx.ligneCommande.create.mockResolvedValue({ id: 'lc-1' });

    await repository.createCommande(data);

    expect(mockTx.commandeArtisan.create).toHaveBeenCalledTimes(2);
    expect(mockTx.commandeArtisan.create).toHaveBeenCalledWith({
      data: {
        commandeId: 'cmd-1',
        artisanId: ARTISAN_1,
        statut: 'COMMANDE',
        sousTotal: 20000,
        commission: 2000,
        fraisLivraison: 1500,
        montantTotal: 21500,
      },
    });
    expect(mockTx.commandeArtisan.create).toHaveBeenCalledWith({
      data: {
        commandeId: 'cmd-1',
        artisanId: ARTISAN_2,
        statut: 'COMMANDE',
        sousTotal: 5000,
        commission: 500,
        fraisLivraison: 1000,
        montantTotal: 6000,
      },
    });
  });

  it('creates LigneCommande entries linked to CommandeArtisan', async () => {
    const { repository, mockTx } = buildRepository();
    mockTx.$executeRaw.mockResolvedValueOnce(2).mockResolvedValueOnce(undefined);
    mockTx.commande.create.mockResolvedValue({ id: 'cmd-1' });
    mockTx.commandeArtisan.create
      .mockResolvedValueOnce({ id: 'ca-1' })
      .mockResolvedValueOnce({ id: 'ca-2' });
    mockTx.ligneCommande.create.mockResolvedValue({ id: 'lc-1' });

    await repository.createCommande(data);

    expect(mockTx.ligneCommande.create).toHaveBeenCalledTimes(2);
    expect(mockTx.ligneCommande.create).toHaveBeenCalledWith({
      data: {
        commandeId: 'cmd-1',
        commandeArtisanId: 'ca-1',
        oeuvreId: OEUVRE_1,
        artisanId: ARTISAN_1,
        prixUnitaire: 10000,
        quantite: 2,
      },
    });
    expect(mockTx.ligneCommande.create).toHaveBeenCalledWith({
      data: {
        commandeId: 'cmd-1',
        commandeArtisanId: 'ca-2',
        oeuvreId: OEUVRE_2,
        artisanId: ARTISAN_2,
        prixUnitaire: 5000,
        quantite: 1,
      },
    });
  });
});

// ---------------------------------------------------------------------------
// C. Rollback complet
// ---------------------------------------------------------------------------
describe('OrderRepository.createCommande full rollback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not create commande when atomic reservation fails', async () => {
    const { repository, mockTx } = buildRepository();
    mockTx.$executeRaw.mockResolvedValueOnce(0);

    await expect(repository.createCommande(data)).rejects.toThrow();
    expect(mockTx.commande.create).not.toHaveBeenCalled();
    expect(mockTx.commandeArtisan.create).not.toHaveBeenCalled();
    expect(mockTx.ligneCommande.create).not.toHaveBeenCalled();
  });

  it('does not create payment or delivery when reservation fails', async () => {
    const { repository, mockTx } = buildRepository();
    mockTx.$executeRaw.mockResolvedValueOnce(0);

    await expect(repository.createCommande(data)).rejects.toThrow();
    expect(mockTx.commande.create).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// D. Libération des œuvres (releaseOeuvres)
// ---------------------------------------------------------------------------
function buildReleaseRepository() {
  const ligneCommande = {
    findMany: vi.fn(),
  };
  const oeuvre = {
    updateMany: vi.fn(),
  };
  const prisma = { ligneCommande, oeuvre };
  const repository = new OrderRepository(prisma as any);
  return { repository, prisma };
}

describe('OrderRepository.releaseOeuvres', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('releases VENDUE artworks back to PUBLIEE', async () => {
    const { repository, prisma } = buildReleaseRepository();
    prisma.ligneCommande.findMany.mockResolvedValue([
      { oeuvreId: OEUVRE_1 },
      { oeuvreId: OEUVRE_2 },
    ]);
    prisma.oeuvre.updateMany.mockResolvedValue({ count: 2 });

    await repository.releaseOeuvres('cmd-1');

    expect(prisma.ligneCommande.findMany).toHaveBeenCalledWith({
      where: { commandeId: 'cmd-1' },
      select: { oeuvreId: true },
    });
    expect(prisma.oeuvre.updateMany).toHaveBeenCalledWith({
      where: {
        id: { in: [OEUVRE_1, OEUVRE_2] },
        statut: { in: ['EN_PANIER', 'VENDUE'] },
      },
      data: { statut: 'PUBLIEE' },
    });
  });

  it('does nothing when the order has no lines', async () => {
    const { repository, prisma } = buildReleaseRepository();
    prisma.ligneCommande.findMany.mockResolvedValue([]);

    await repository.releaseOeuvres('cmd-1');

    expect(prisma.oeuvre.updateMany).not.toHaveBeenCalled();
  });
});
