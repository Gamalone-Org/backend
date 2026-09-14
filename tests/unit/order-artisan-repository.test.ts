import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  OrderRepository,
  computeGlobalCommandStatus,
} from '../../src/modules/orders/order.repository.js';
import type { OrderStatus } from '../../src/generated/prisma/client.js';

const ARTISAN_PROFILE_ID = '123e4567-e89b-12d3-a456-426614174111';
const CA_ID = '123e4567-e89b-12d3-a456-426614174222';

describe('computeGlobalCommandStatus', () => {
  it('returns the minimum rank among active CommandeArtisan', () => {
    expect(
      computeGlobalCommandStatus(['EXPEDIEE', 'COMMANDE'] as OrderStatus[])
    ).toBe('COMMANDE');
    expect(
      computeGlobalCommandStatus(['PREPARATION', 'EXPEDIEE'] as OrderStatus[])
    ).toBe('PREPARATION');
    expect(computeGlobalCommandStatus(['CLOTUREE'] as OrderStatus[])).toBe('CLOTUREE');
  });

  it('ignores terminal statuses when computing the minimum', () => {
    expect(
      computeGlobalCommandStatus(['ANNULEE', 'PREPARATION'] as OrderStatus[])
    ).toBe('PREPARATION');
    expect(
      computeGlobalCommandStatus(['EXPEDIEE', 'ANNULEE'] as OrderStatus[])
    ).toBe('EXPEDIEE');
  });

  it('returns null when only terminal CommandeArtisan remain', () => {
    expect(
      computeGlobalCommandStatus(['ANNULEE', 'REMBOURSEE'] as OrderStatus[])
    ).toBeNull();
  });
});

function createArtisanTxMock() {
  return {
    commandeArtisan: {
      updateMany: vi.fn(),
      findFirstOrThrow: vi.fn(),
      findMany: vi.fn(),
    },
    commande: {
      findUniqueOrThrow: vi.fn(),
      update: vi.fn(),
    },
    livraison: {
      updateMany: vi.fn(),
    },
  } as any;
}

function buildAdvanceRepository(mockTx = createArtisanTxMock()) {
  const prisma = {
    $transaction: vi.fn(async (callback: (client: any) => Promise<unknown>) =>
      callback(mockTx)
    ),
  };
  const repository = new OrderRepository(prisma as any);
  return { repository, prisma, mockTx };
}

describe('OrderRepository.advanceArtisanCommand', () => {
  beforeEach(() => vi.clearAllMocks());

  it('advances the CommandeArtisan and updates the global status when the minimum changes', async () => {
    const { repository, mockTx } = buildAdvanceRepository();
    mockTx.commandeArtisan.updateMany.mockResolvedValue({ count: 1 });
    mockTx.commandeArtisan.findFirstOrThrow.mockResolvedValue({ commandeId: 'cmd-1' });
    mockTx.commande.findUniqueOrThrow.mockResolvedValue({ statut: 'COMMANDE' });
    mockTx.commandeArtisan.findMany.mockResolvedValue([
      { statut: 'PREPARATION' },
      { statut: 'EXPEDIEE' },
      { statut: 'ANNULEE' },
    ]);

    const result = await repository.advanceArtisanCommand(
      CA_ID,
      ARTISAN_PROFILE_ID,
      'COMMANDE',
      'PREPARATION'
    );

    expect(mockTx.commandeArtisan.updateMany).toHaveBeenCalledWith({
      where: { id: CA_ID, artisanId: ARTISAN_PROFILE_ID, statut: 'COMMANDE' },
      data: { statut: 'PREPARATION' },
    });
    expect(mockTx.commandeArtisan.findMany).toHaveBeenCalledWith({
      where: {
        commandeId: 'cmd-1',
        statut: { notIn: ['ANNULEE', 'REMBOURSEE'] },
      },
      select: { statut: true },
    });
    expect(mockTx.commande.update).toHaveBeenCalledWith({
      where: { id: 'cmd-1' },
      data: { statut: 'PREPARATION' },
    });
    // Synchronisation R2 : le statut global ayant avancé, la livraison suit
    expect(mockTx.livraison.updateMany).toHaveBeenCalledWith({
      where: { commandeId: 'cmd-1', statut: { in: ['EN_ATTENTE'] } },
      data: { statut: 'PREPAREE' },
    });
    expect(result).toEqual({ commandeArtisanId: CA_ID, statutGlobal: 'PREPARATION' });
  });

  it('does not update the global status when the minimum is unchanged', async () => {
    const { repository, mockTx } = buildAdvanceRepository();
    mockTx.commandeArtisan.updateMany.mockResolvedValue({ count: 1 });
    mockTx.commandeArtisan.findFirstOrThrow.mockResolvedValue({ commandeId: 'cmd-1' });
    mockTx.commande.findUniqueOrThrow.mockResolvedValue({ statut: 'COMMANDE' });
    mockTx.commandeArtisan.findMany.mockResolvedValue([
      { statut: 'COMMANDE' },
      { statut: 'COMMANDE' },
    ]);

    const result = await repository.advanceArtisanCommand(
      CA_ID,
      ARTISAN_PROFILE_ID,
      'COMMANDE',
      'PREPARATION'
    );

    expect(mockTx.commande.update).not.toHaveBeenCalled();
    expect(mockTx.livraison.updateMany).not.toHaveBeenCalled();
    expect(result).toEqual({ commandeArtisanId: CA_ID, statutGlobal: 'COMMANDE' });
  });

  it('returns null on concurrent modification (no row matched)', async () => {
    const { repository, mockTx } = buildAdvanceRepository();
    mockTx.commandeArtisan.updateMany.mockResolvedValue({ count: 0 });

    const result = await repository.advanceArtisanCommand(
      CA_ID,
      ARTISAN_PROFILE_ID,
      'COMMANDE',
      'PREPARATION'
    );

    expect(result).toBeNull();
    expect(mockTx.commandeArtisan.findFirstOrThrow).not.toHaveBeenCalled();
  });
});

describe('OrderRepository.updateStatut propagation to CommandeArtisan', () => {
  beforeEach(() => vi.clearAllMocks());

  function buildUpdateRepository() {
    const mockTx = {
      commande: { update: vi.fn() },
      commandeArtisan: { updateMany: vi.fn() },
      livraison: { updateMany: vi.fn() },
    } as any;
    const prisma = {
      $transaction: vi.fn(async (callback: (client: any) => Promise<unknown>) =>
        callback(mockTx)
      ),
    };
    const repository = new OrderRepository(prisma as any);
    return { repository, prisma, mockTx };
  }

  it('propagates the global status change to active CommandeArtisan', async () => {
    const { repository, mockTx } = buildUpdateRepository();
    mockTx.commande.update.mockResolvedValue({
      id: 'cmd-1',
      statut: 'ANNULEE',
      updatedAt: new Date(),
    });

    const result = await repository.updateStatut('cmd-1', 'ANNULEE');

    expect(mockTx.commande.update).toHaveBeenCalledWith({
      where: { id: 'cmd-1' },
      data: { statut: 'ANNULEE' },
      select: { id: true, statut: true, updatedAt: true },
    });
    expect(mockTx.commandeArtisan.updateMany).toHaveBeenCalledWith({
      where: { commandeId: 'cmd-1', statut: { notIn: ['ANNULEE', 'REMBOURSEE'] } },
      data: { statut: 'ANNULEE' },
    });
    expect(result.statut).toBe('ANNULEE');
  });

  it('does not regress a CommandeArtisan already ahead of the global target (P1)', async () => {
    const { repository, mockTx } = buildUpdateRepository();
    mockTx.commande.update.mockResolvedValue({
      id: 'cmd-1',
      statut: 'PREPARATION',
      updatedAt: new Date(),
    });

    await repository.updateStatut('cmd-1', 'PREPARATION');

    // Une CommandeArtisan déjà en PREPARATION ou plus avancée n'est PAS écrasée.
    expect(mockTx.commandeArtisan.updateMany).toHaveBeenCalledWith({
      where: {
        commandeId: 'cmd-1',
        statut: {
          notIn: ['PREPARATION', 'EXPEDIEE', 'LIVREE', 'CLOTUREE', 'ANNULEE', 'REMBOURSEE'],
        },
      },
      data: { statut: 'PREPARATION' },
    });
  });

  it('advances the Livraison monotonically on a forward order step (R2)', async () => {
    const { repository, mockTx } = buildUpdateRepository();
    mockTx.commande.update.mockResolvedValue({
      id: 'cmd-1',
      statut: 'PREPARATION',
      updatedAt: new Date(),
    });

    await repository.updateStatut('cmd-1', 'PREPARATION');

    // EN_ATTENTE → PREPAREE uniquement : une livraison plus avancée est intacte.
    expect(mockTx.livraison.updateMany).toHaveBeenCalledWith({
      where: { commandeId: 'cmd-1', statut: { in: ['EN_ATTENTE'] } },
      data: { statut: 'PREPAREE' },
    });
  });

  it('syncs the Livraison to LIVREE when the order reaches LIVREE (R2)', async () => {
    const { repository, mockTx } = buildUpdateRepository();
    mockTx.commande.update.mockResolvedValue({
      id: 'cmd-1',
      statut: 'LIVREE',
      updatedAt: new Date(),
    });

    await repository.updateStatut('cmd-1', 'LIVREE');

    expect(mockTx.commandeArtisan.updateMany).toHaveBeenCalledWith({
      where: {
        commandeId: 'cmd-1',
        statut: { notIn: ['LIVREE', 'CLOTUREE', 'ANNULEE', 'REMBOURSEE'] },
      },
      data: { statut: 'LIVREE' },
    });
    expect(mockTx.livraison.updateMany).toHaveBeenCalledWith({
      where: {
        commandeId: 'cmd-1',
        statut: { in: ['EN_ATTENTE', 'PREPAREE', 'EXPEDIEE', 'EN_TRANSIT'] },
      },
      data: { statut: 'LIVREE' },
    });
  });

  it('does not touch the Livraison when the order is cancelled (R2)', async () => {
    const { repository, mockTx } = buildUpdateRepository();
    mockTx.commande.update.mockResolvedValue({
      id: 'cmd-1',
      statut: 'ANNULEE',
      updatedAt: new Date(),
    });

    await repository.updateStatut('cmd-1', 'ANNULEE');

    // Annulation administrative : l'expédition physique n'est pas modifiée.
    expect(mockTx.livraison.updateMany).not.toHaveBeenCalled();
  });
});

describe('OrderRepository artisan queries', () => {
  beforeEach(() => vi.clearAllMocks());

  function buildListRepository() {
    const commandeArtisan = {
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
    };
    const prisma = { commandeArtisan };
    const repository = new OrderRepository(prisma as any);
    return { repository, commandeArtisan };
  }

  it('applies artisanId, statut filter and q search with pagination', async () => {
    const { repository, commandeArtisan } = buildListRepository();
    commandeArtisan.findMany.mockResolvedValue([{ id: CA_ID }]);
    commandeArtisan.count.mockResolvedValue(1);

    const result = await repository.findAllForArtisan(ARTISAN_PROFILE_ID, 2, 10, {
      statut: 'PREPARATION',
      q: 'awa',
    });

    const call = commandeArtisan.findMany.mock.calls[0][0];
    expect(call.where.artisanId).toBe(ARTISAN_PROFILE_ID);
    expect(call.where.statut).toBe('PREPARATION');
    expect(call.where.OR).toBeDefined();
    expect(call.skip).toBe(10);
    expect(call.take).toBe(10);
    expect(commandeArtisan.count).toHaveBeenCalledTimes(1);
    expect(result.total).toBe(1);
  });

  it('does not add filters when none are provided', async () => {
    const { repository, commandeArtisan } = buildListRepository();
    commandeArtisan.findMany.mockResolvedValue([]);
    commandeArtisan.count.mockResolvedValue(0);

    await repository.findAllForArtisan(ARTISAN_PROFILE_ID, 1, 20, {});

    const call = commandeArtisan.findMany.mock.calls[0][0];
    expect(call.where.artisanId).toBe(ARTISAN_PROFILE_ID);
    expect(call.where.statut).toBeUndefined();
    expect(call.where.OR).toBeUndefined();
  });

  it('adds exact id equality branches when q is a UUID', async () => {
    const { repository, commandeArtisan } = buildListRepository();
    commandeArtisan.findMany.mockResolvedValue([]);
    commandeArtisan.count.mockResolvedValue(0);

    await repository.findAllForArtisan(ARTISAN_PROFILE_ID, 1, 20, { q: CA_ID });

    const call = commandeArtisan.findMany.mock.calls[0][0];
    expect(call.where.OR).toEqual(
      expect.arrayContaining([
        { id: { equals: CA_ID } },
        { commande: { id: { equals: CA_ID } } },
      ])
    );
  });

  it('does not add id equality branches when q is not a UUID', async () => {
    const { repository, commandeArtisan } = buildListRepository();
    commandeArtisan.findMany.mockResolvedValue([]);
    commandeArtisan.count.mockResolvedValue(0);

    await repository.findAllForArtisan(ARTISAN_PROFILE_ID, 1, 20, { q: 'awa-123' });

    const call = commandeArtisan.findMany.mock.calls[0][0];
    expect(call.where.OR.some((o: any) => o.id || o.commande?.id)).toBe(false);
  });

  it('maps groupBy counts with zero defaults for missing statuses', async () => {
    const { repository, commandeArtisan } = buildListRepository();
    commandeArtisan.groupBy.mockResolvedValue([
      { statut: 'COMMANDE', _count: { _all: 3 } },
      { statut: 'PREPARATION', _count: { _all: 1 } },
    ]);

    const counts = await repository.getArtisanOrderCounts(ARTISAN_PROFILE_ID);

    expect(counts.COMMANDE).toBe(3);
    expect(counts.PREPARATION).toBe(1);
    expect(counts.EXPEDIEE).toBe(0);
    expect(counts.CLOTUREE).toBe(0);
    expect(counts.ANNULEE).toBe(0);
  });
});

describe('OrderRepository artisan eligibility', () => {
  beforeEach(() => vi.clearAllMocks());

  function buildEligibilityRepository(overrides = {}) {
    const prisma = {
      artisanProfile: { findUnique: vi.fn() },
      kyc: { findFirst: vi.fn() },
      ...overrides,
    };
    const repository = new OrderRepository(prisma as any);
    return { repository, prisma };
  }

  it('findArtisanEligibility returns the profile id and user statut', async () => {
    const { repository, prisma } = buildEligibilityRepository();
    prisma.artisanProfile.findUnique.mockResolvedValue({
      id: ARTISAN_PROFILE_ID,
      user: { statut: 'ACTIF' },
    });

    const profile = await repository.findArtisanEligibility('user-1');

    expect(prisma.artisanProfile.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: { id: true, user: { select: { statut: true } } },
    });
    expect(profile).toEqual({ id: ARTISAN_PROFILE_ID, user: { statut: 'ACTIF' } });
  });

  it('findArtisanEligibility returns null when the profile does not exist', async () => {
    const { repository, prisma } = buildEligibilityRepository();
    prisma.artisanProfile.findUnique.mockResolvedValue(null);

    await expect(repository.findArtisanEligibility('user-1')).resolves.toBeNull();
  });

  it('findKycValidForUser returns the latest non-deleted VALIDE kyc', async () => {
    const { repository, prisma } = buildEligibilityRepository();
    prisma.kyc.findFirst.mockResolvedValue({ id: 'kyc-1', status: 'VALIDE' });

    const kyc = await repository.findKycValidForUser('user-1');

    expect(prisma.kyc.findFirst).toHaveBeenCalledWith({
      where: { userId: 'user-1', deletedAt: null },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    expect(kyc?.status).toBe('VALIDE');
  });

  it('findKycValidForUser returns null when the latest kyc is not VALIDE', async () => {
    const { repository, prisma } = buildEligibilityRepository();
    prisma.kyc.findFirst.mockResolvedValue({ id: 'kyc-1', status: 'REJETE' });

    const kyc = await repository.findKycValidForUser('user-1');

    expect(kyc).toBeNull();
  });
});

describe('OrderRepository.findForAcheteur (Espace Acheteur)', () => {
  beforeEach(() => vi.clearAllMocks());

  function buildBuyerListRepository() {
    const commande = {
      findMany: vi.fn(),
      count: vi.fn(),
    };
    const prisma = { commande };
    const repository = new OrderRepository(prisma as any);
    return { repository, commande };
  }

  it('keeps acheteurId ownership and applies statuts IN with default desc order', async () => {
    const { repository, commande } = buildBuyerListRepository();
    commande.findMany.mockResolvedValue([]);
    commande.count.mockResolvedValue(0);

    await repository.findForAcheteur('bp-1', 1, 20, {
      statuts: ['COMMANDE', 'PREPARATION'],
    });

    const call = commande.findMany.mock.calls[0][0];
    expect(call.where.acheteurId).toBe('bp-1');
    expect(call.where.statut).toEqual({ in: ['COMMANDE', 'PREPARATION'] });
    expect(call.where.AND).toBeUndefined();
    expect(call.orderBy).toEqual({ dateCreation: 'desc' });
    expect(call.skip).toBe(0);
    expect(call.take).toBe(20);
    expect(commande.count).toHaveBeenCalledWith({ where: call.where });
  });

  it('search q builds AND clauses without bypassing ownership (isolation)', async () => {
    const { repository, commande } = buildBuyerListRepository();
    commande.findMany.mockResolvedValue([]);
    commande.count.mockResolvedValue(0);

    await repository.findForAcheteur('bp-1', 1, 20, { q: 'sculpture' });

    const call = commande.findMany.mock.calls[0][0];
    expect(call.where.acheteurId).toBe('bp-1');
    expect(call.where.OR).toBeUndefined();
    const clauses = call.where.AND as any[];
    expect(
      clauses.some((c: any) => c.lignesCommande?.some?.oeuvre?.titre?.contains === 'sculpture')
    ).toBe(true);
    expect(
      clauses.some((c: any) => c.commandesArtisans?.some?.artisan?.nomAtelier?.contains === 'sculpture')
    ).toBe(true);
    expect(
      clauses.some((c: any) => c.lignesCommande?.some?.artisan?.user?.nom?.contains === 'sculpture')
    ).toBe(true);
  });

  it('matches by exact order id when q is a UUID, still ownership-bound', async () => {
    const { repository, commande } = buildBuyerListRepository();
    commande.findMany.mockResolvedValue([]);
    commande.count.mockResolvedValue(0);

    await repository.findForAcheteur('bp-1', 1, 20, { q: CA_ID });

    const call = commande.findMany.mock.calls[0][0];
    expect(call.where.acheteurId).toBe('bp-1');
    expect(call.where.AND).toContainEqual({ id: { equals: CA_ID } });
  });

  it('does not add an id equality clause when q is not a UUID', async () => {
    const { repository, commande } = buildBuyerListRepository();
    commande.findMany.mockResolvedValue([]);
    commande.count.mockResolvedValue(0);

    await repository.findForAcheteur('bp-1', 1, 20, { q: 'awa-123' });

    const call = commande.findMany.mock.calls[0][0];
    expect((call.where.AND as any[]).some((c: any) => c.id)).toBe(false);
  });

  it('orders ascending when tri=dateCreation_asc', async () => {
    const { repository, commande } = buildBuyerListRepository();
    commande.findMany.mockResolvedValue([]);
    commande.count.mockResolvedValue(0);

    await repository.findForAcheteur('bp-1', 1, 20, { tri: 'dateCreation_asc' });

    const call = commande.findMany.mock.calls[0][0];
    expect(call.orderBy).toEqual({ dateCreation: 'asc' });
  });

  it('defaults to only acheteurId (backward compatibility)', async () => {
    const { repository, commande } = buildBuyerListRepository();
    commande.findMany.mockResolvedValue([]);
    commande.count.mockResolvedValue(0);

    await repository.findForAcheteur('bp-1', 1, 20, {});

    const call = commande.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ acheteurId: 'bp-1' });
    expect(call.orderBy).toEqual({ dateCreation: 'desc' });
  });

  it('applies statut + q + tri + pagination and counts filtered rows', async () => {
    const { repository, commande } = buildBuyerListRepository();
    commande.findMany.mockResolvedValue([{ id: 'cmd-1' }]);
    commande.count.mockResolvedValue(7);

    const result = await repository.findForAcheteur('bp-1', 2, 10, {
      statuts: ['EXPEDIEE'],
      q: 'awa',
      tri: 'dateCreation_asc',
    });

    const call = commande.findMany.mock.calls[0][0];
    expect(call.where.acheteurId).toBe('bp-1');
    expect(call.where.statut).toEqual({ in: ['EXPEDIEE'] });
    expect(call.where.AND).toBeDefined();
    expect(call.skip).toBe(10);
    expect(call.take).toBe(10);
    expect(call.orderBy).toEqual({ dateCreation: 'asc' });
    expect(commande.count).toHaveBeenCalledWith({ where: call.where });
    expect(result).toEqual({ commandes: [{ id: 'cmd-1' }], total: 7 });
  });
});