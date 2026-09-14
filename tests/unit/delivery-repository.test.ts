import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DeliveryRepository } from '../../src/modules/deliveries/delivery.repository.js';

function createPrismaMock() {
  return {
    livraison: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  };
}

function buildRepository(prisma = createPrismaMock()) {
  const repository = new DeliveryRepository(prisma as any);
  return { repository, prisma };
}

const CMD_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('DeliveryRepository.findAllForAdmin', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('construit un OR Prisma avec les 4 critères lorsqu’un q est fourni', async () => {
    const { repository, prisma } = buildRepository();
    prisma.livraison.findMany.mockResolvedValue([]);
    prisma.livraison.count.mockResolvedValue(0);

    await repository.findAllForAdmin(1, 20, { q: 'DHL' });

    const where = prisma.livraison.findMany.mock.calls[0][0].where;
    expect(where.OR).toHaveLength(4);
    expect(where.OR).toContainEqual({ commande: { id: { equals: 'DHL' } } });
    expect(where.OR).toContainEqual({ numeroSuivi: { contains: 'DHL', mode: 'insensitive' } });
    expect(where.OR).toContainEqual({ transporteur: { contains: 'DHL', mode: 'insensitive' } });
    expect(where.OR).toContainEqual({ adresseDest: { contains: 'DHL', mode: 'insensitive' } });
  });

  it('recherche uniquement sur Commande.id (égalité stricte UUID)', async () => {
    const { repository, prisma } = buildRepository();
    prisma.livraison.findMany.mockResolvedValue([]);
    prisma.livraison.count.mockResolvedValue(0);

    await repository.findAllForAdmin(1, 20, { q: CMD_ID });

    const where = prisma.livraison.findMany.mock.calls[0][0].where;
    expect(where.OR?.[0]).toEqual({ commande: { id: { equals: CMD_ID } } });
  });

  it('recherche le numeroSuivi avec contains insensible à la casse', async () => {
    const { repository, prisma } = buildRepository();
    prisma.livraison.findMany.mockResolvedValue([]);
    prisma.livraison.count.mockResolvedValue(0);

    await repository.findAllForAdmin(1, 20, { q: 'tg48' });

    const where = prisma.livraison.findMany.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({ numeroSuivi: { contains: 'tg48', mode: 'insensitive' } });
  });

  it('recherche le transporteur avec contains insensible à la casse', async () => {
    const { repository, prisma } = buildRepository();
    prisma.livraison.findMany.mockResolvedValue([]);
    prisma.livraison.count.mockResolvedValue(0);

    await repository.findAllForAdmin(1, 20, { q: 'chrono' });

    const where = prisma.livraison.findMany.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({
      transporteur: { contains: 'chrono', mode: 'insensitive' },
    });
  });

  it('recherche adresseDest avec contains insensible à la casse', async () => {
    const { repository, prisma } = buildRepository();
    prisma.livraison.findMany.mockResolvedValue([]);
    prisma.livraison.count.mockResolvedValue(0);

    await repository.findAllForAdmin(1, 20, { q: 'tokoin' });

    const where = prisma.livraison.findMany.mock.calls[0][0].where;
    expect(where.OR).toContainEqual({
      adresseDest: { contains: 'tokoin', mode: 'insensitive' },
    });
  });

  it('n’ajoute aucun OR lorsque q est absent', async () => {
    const { repository, prisma } = buildRepository();
    prisma.livraison.findMany.mockResolvedValue([]);
    prisma.livraison.count.mockResolvedValue(0);

    await repository.findAllForAdmin(1, 20, {});

    const where = prisma.livraison.findMany.mock.calls[0][0].where;
    expect(where).not.toHaveProperty('OR');
    expect(where.OR).toBeUndefined();
  });

  it('combine le filtre statut avec la recherche q', async () => {
    const { repository, prisma } = buildRepository();
    prisma.livraison.findMany.mockResolvedValue([]);
    prisma.livraison.count.mockResolvedValue(0);

    await repository.findAllForAdmin(1, 20, { q: 'DHL', statut: 'EN_TRANSIT' });

    const where = prisma.livraison.findMany.mock.calls[0][0].where;
    expect(where.statut).toBe('EN_TRANSIT');
    expect(where.OR).toHaveLength(4);
  });

  it('applique le filtre statut seul sans OR', async () => {
    const { repository, prisma } = buildRepository();
    prisma.livraison.findMany.mockResolvedValue([]);
    prisma.livraison.count.mockResolvedValue(0);

    await repository.findAllForAdmin(1, 20, { statut: 'LIVREE' });

    const where = prisma.livraison.findMany.mock.calls[0][0].where;
    expect(where.statut).toBe('LIVREE');
    expect(where.OR).toBeUndefined();
  });

  it('applique la pagination skip = (page - 1) * limit et take = limit', async () => {
    const { repository, prisma } = buildRepository();
    prisma.livraison.findMany.mockResolvedValue([]);
    prisma.livraison.count.mockResolvedValue(0);

    await repository.findAllForAdmin(3, 20, {});

    const { skip, take } = prisma.livraison.findMany.mock.calls[0][0];
    expect(skip).toBe(40);
    expect(take).toBe(20);
  });

  it('trie par date de commande décroissante', async () => {
    const { repository, prisma } = buildRepository();
    prisma.livraison.findMany.mockResolvedValue([]);
    prisma.livraison.count.mockResolvedValue(0);

    await repository.findAllForAdmin(1, 20, {});

    expect(prisma.livraison.findMany.mock.calls[0][0].orderBy).toEqual({
      commande: { dateCreation: 'desc' },
    });
  });

  it('compte avec le même where que la liste', async () => {
    const { repository, prisma } = buildRepository();
    const rows = [{ id: 'del-1' }];
    prisma.livraison.findMany.mockResolvedValue(rows);
    prisma.livraison.count.mockResolvedValue(42);

    const result = await repository.findAllForAdmin(1, 20, { statut: 'EXPEDIEE' });

    const listWhere = prisma.livraison.findMany.mock.calls[0][0].where;
    const countWhere = prisma.livraison.count.mock.calls[0][0].where;
    expect(listWhere).toEqual({ statut: 'EXPEDIEE' });
    expect(countWhere).toEqual(listWhere);
    expect(result).toEqual({ livraisons: rows, total: 42 });
  });
});

describe('DeliveryRepository.findByIdForAdmin', () => {
  it('interroge prisma.livraison.findUnique avec l’id et le select détail', async () => {
    const { repository, prisma } = buildRepository();
    prisma.livraison.findUnique.mockResolvedValue({ id: 'del-1' });

    await repository.findByIdForAdmin('del-1');

    expect(prisma.livraison.findUnique).toHaveBeenCalledWith({
      where: { id: 'del-1' },
      select: expect.objectContaining({ commande: expect.anything() }),
    });
  });

  it('retourne null quand la livraison n’existe pas', async () => {
    const { repository, prisma } = buildRepository();
    prisma.livraison.findUnique.mockResolvedValue(null);

    const result = await repository.findByIdForAdmin('missing');

    expect(result).toBeNull();
  });
});

describe('DeliveryRepository.findByIdSummary', () => {
  it('sélectionne uniquement id et statut', async () => {
    const { repository, prisma } = buildRepository();
    prisma.livraison.findUnique.mockResolvedValue({ id: 'del-1', statut: 'EN_ATTENTE' });

    const result = await repository.findByIdSummary('del-1');

    expect(prisma.livraison.findUnique).toHaveBeenCalledWith({
      where: { id: 'del-1' },
      select: { id: true, statut: true },
    });
    expect(result).toEqual({ id: 'del-1', statut: 'EN_ATTENTE' });
  });
});

describe('DeliveryRepository.updateDelivery', () => {
  it('met à jour directement prisma.livraison (jamais via Orders)', async () => {
    const { repository, prisma } = buildRepository();
    prisma.livraison.update.mockResolvedValue({
      id: 'del-1',
      transporteur: 'Chronopost',
      numeroSuivi: 'TG48-851',
      statut: 'EN_ATTENTE',
    });

    const result = await repository.updateDelivery('del-1', {
      transporteur: 'Chronopost',
      numeroSuivi: 'TG48-851',
    });

    expect(prisma.livraison.update).toHaveBeenCalledWith({
      where: { id: 'del-1' },
      data: { transporteur: 'Chronopost', numeroSuivi: 'TG48-851' },
      select: { id: true, transporteur: true, numeroSuivi: true, statut: true },
    });
    expect(result.transporteur).toBe('Chronopost');
  });
});

describe('DeliveryRepository.updateStatus', () => {
  function buildUpdateRepository() {
    const tx = {
      livraison: { update: vi.fn() },
      commande: { findUnique: vi.fn(), update: vi.fn() },
      commandeArtisan: { updateMany: vi.fn() },
    } as any;
    const prisma = {
      $transaction: vi.fn(async (callback: (client: any) => Promise<unknown>) =>
        callback(tx)
      ),
    };
    const repository = new DeliveryRepository(prisma as any);
    return { repository, tx };
  }

  it('met à jour uniquement le statut de livraison hors LIVREE (pas de sync Commande)', async () => {
    const { repository, tx } = buildUpdateRepository();
    tx.livraison.update.mockResolvedValue({
      id: 'del-1',
      statut: 'EXPEDIEE',
      commandeId: CMD_ID,
    });

    const result = await repository.updateStatus('del-1', 'EXPEDIEE');

    expect(tx.livraison.update).toHaveBeenCalledWith({
      where: { id: 'del-1' },
      data: { statut: 'EXPEDIEE' },
      select: { id: true, statut: true, commandeId: true },
    });
    expect(tx.commande.findUnique).not.toHaveBeenCalled();
    expect(result.statut).toBe('EXPEDIEE');
  });

  it('syncs la Commande globale à LIVREE quand la livraison atteint LIVREE (R2)', async () => {
    const { repository, tx } = buildUpdateRepository();
    tx.livraison.update.mockResolvedValue({
      id: 'del-1',
      statut: 'LIVREE',
      commandeId: CMD_ID,
    });
    tx.commande.findUnique.mockResolvedValue({ id: CMD_ID, statut: 'EXPEDIEE' });

    const result = await repository.updateStatus('del-1', 'LIVREE');

    expect(tx.commande.findUnique).toHaveBeenCalledWith({
      where: { id: CMD_ID },
      select: { id: true, statut: true },
    });
    expect(tx.commande.update).toHaveBeenCalledWith({
      where: { id: CMD_ID },
      data: { statut: 'LIVREE' },
    });
    expect(tx.commandeArtisan.updateMany).toHaveBeenCalledWith({
      where: {
        commandeId: CMD_ID,
        statut: { notIn: ['LIVREE', 'CLOTUREE', 'ANNULEE', 'REMBOURSEE'] },
      },
      data: { statut: 'LIVREE' },
    });
    expect(result).toEqual({ id: 'del-1', statut: 'LIVREE' });
  });

  it('ne régresse pas une Commande CLOTUREE quand la livraison est LIVREE (R2)', async () => {
    const { repository, tx } = buildUpdateRepository();
    tx.livraison.update.mockResolvedValue({
      id: 'del-1',
      statut: 'LIVREE',
      commandeId: CMD_ID,
    });
    tx.commande.findUnique.mockResolvedValue({ id: CMD_ID, statut: 'CLOTUREE' });

    await repository.updateStatus('del-1', 'LIVREE');

    expect(tx.commande.update).not.toHaveBeenCalled();
    expect(tx.commandeArtisan.updateMany).not.toHaveBeenCalled();
  });

  it('ne régresse pas une Commande ANNULEE quand la livraison est LIVREE (R2)', async () => {
    const { repository, tx } = buildUpdateRepository();
    tx.livraison.update.mockResolvedValue({
      id: 'del-1',
      statut: 'LIVREE',
      commandeId: CMD_ID,
    });
    tx.commande.findUnique.mockResolvedValue({ id: CMD_ID, statut: 'ANNULEE' });

    await repository.updateStatus('del-1', 'LIVREE');

    expect(tx.commande.update).not.toHaveBeenCalled();
    expect(tx.commandeArtisan.updateMany).not.toHaveBeenCalled();
  });
});

describe('DeliveryRepository.findForExport', () => {
  it('applique les mêmes filtres que la liste avec un take borné', async () => {
    const { repository, prisma } = buildRepository();
    prisma.livraison.findMany.mockResolvedValue([]);

    await repository.findForExport({ q: 'DHL', statut: 'EN_TRANSIT' }, 5000);

    const { where, take, skip } = prisma.livraison.findMany.mock.calls[0][0];
    expect(where.statut).toBe('EN_TRANSIT');
    expect(where.OR).toHaveLength(4);
    expect(take).toBe(5000);
    expect(skip).toBeUndefined();
  });

  it('exporte l’ensemble des résultats filtrés sans pagination de page', async () => {
    const { repository, prisma } = buildRepository();
    prisma.livraison.findMany.mockResolvedValue([{ id: 'del-1' }]);

    const result = await repository.findForExport({}, 5000);

    expect(result).toEqual([{ id: 'del-1' }]);
    expect(prisma.livraison.count).not.toHaveBeenCalled();
  });
});