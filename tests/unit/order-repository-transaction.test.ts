import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderRepository } from '../../src/modules/orders/order.repository.js';

function createTransactionMock() {
  return {
    commande: {
      create: vi.fn(),
    },
    oeuvre: {
      updateMany: vi.fn(),
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

const data = {
  acheteurId: 'buyer-1',
  lignes: [
    { oeuvreId: OEUVRE_1, artisanId: 'artisan-1', prixUnitaire: 10000, quantite: 2 },
    { oeuvreId: OEUVRE_2, artisanId: 'artisan-2', prixUnitaire: 5000, quantite: 1 },
  ],
  sousTotal: 25000,
  fraisLivraison: 2500,
  montantTotal: 27500,
  commission: 2500,
  methodePaiement: 'MOBILE_MONEY' as const,
  adresseDest: 'Lomé, Tokoin',
  transporteur: 'DHL',
};

describe('OrderRepository.createCommande atomicity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates the order, its lines, payment and delivery in one transaction', async () => {
    const { repository, prisma, mockTx } = buildRepository();
    mockTx.commande.create.mockResolvedValue({ id: 'cmd-1' });
    mockTx.oeuvre.updateMany.mockResolvedValue({ count: 2 });

    const result = await repository.createCommande(data);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockTx.commande.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        acheteurId: 'buyer-1',
        montantTotal: 27500,
        commission: 2500,
        fraisLivraison: 2500,
        lignesCommande: {
          create: [
            { oeuvreId: OEUVRE_1, artisanId: 'artisan-1', prixUnitaire: 10000, quantite: 2 },
            { oeuvreId: OEUVRE_2, artisanId: 'artisan-2', prixUnitaire: 5000, quantite: 1 },
          ],
        },
      }),
    });
    expect(result.id).toBe('cmd-1');
  });

  it('marks the ordered artworks as VENDUES within the same transaction', async () => {
    const { repository, prisma, mockTx } = buildRepository();
    mockTx.commande.create.mockResolvedValue({ id: 'cmd-1' });
    mockTx.oeuvre.updateMany.mockResolvedValue({ count: 2 });

    await repository.createCommande(data);

    expect(mockTx.oeuvre.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [OEUVRE_1, OEUVRE_2] } },
      data: { statut: 'VENDUE' },
    });
    // Both the commande creation and the part of the artworks happen within the single transaction.
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('rolls back the whole transaction when the commande creation fails', async () => {
    const { repository, prisma, mockTx } = buildRepository();
    mockTx.commande.create.mockRejectedValue(new Error('P2003'));

    await expect(repository.createCommande(data)).rejects.toThrow('P2003');

    // The updateMany never runs because the transaction aborts before reaching it.
    expect(mockTx.oeuvre.updateMany).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
