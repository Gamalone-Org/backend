import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CategorieRepository } from '../../src/modules/categories/categorie.repository';

function createPrismaMock() {
  return {
    categorie: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
    },
    sousCategorie: {
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  };
}

function buildRepository(prisma = createPrismaMock()) {
  const repository = new CategorieRepository(prisma as any, () => ({} as any));
  return { repository, prisma };
}

describe('Phase 2 — CategorieRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listCategories', () => {
    it('construit le where depuis les filtres, inclu le nombre d’œuvres et pagine', async () => {
      const { repository, prisma } = buildRepository();
      prisma.categorie.count.mockResolvedValue(5);
      prisma.categorie.findMany.mockResolvedValue([{ id: 'cat-1' }]);
      prisma.$transaction.mockResolvedValue([5, [{ id: 'cat-1' }]]);

      const result = await repository.listCategories({
        page: 2,
        limit: 10,
        statut: 'ACTIVE',
        q: 'sculp',
      });

      const findArgs = prisma.categorie.findMany.mock.calls[0][0];
      expect(findArgs.where).toEqual({
        statut: 'ACTIVE',
        nom: { contains: 'sculp', mode: 'insensitive' },
      });
      expect(findArgs.orderBy).toEqual([{ position: 'asc' }, { nom: 'asc' }]);
      expect(findArgs.skip).toBe(10);
      expect(findArgs.take).toBe(10);
      expect(findArgs.include).toEqual({
        sousCategories: { orderBy: [{ position: 'asc' }, { nom: 'asc' }] },
        _count: { select: { oeuvres: true } },
      });
      expect(prisma.categorie.count.mock.calls[0][0].where).toEqual(findArgs.where);
      expect(result).toEqual({ items: [{ id: 'cat-1' }], total: 5, page: 2, limit: 10 });
    });

    it('ne filtre pas statut ni q quand ils sont absents', async () => {
      const { repository, prisma } = buildRepository();
      prisma.categorie.count.mockResolvedValue(0);
      prisma.categorie.findMany.mockResolvedValue([]);
      prisma.$transaction.mockResolvedValue([0, []]);

      await repository.listCategories({ page: 1, limit: 20 });

      expect(prisma.categorie.findMany.mock.calls[0][0].where).toEqual({});
    });
  });

  describe('findForExport', () => {
    it('applique les mêmes filtres que la liste avec un take borné, sans skip', async () => {
      const { repository, prisma } = buildRepository();
      prisma.categorie.findMany.mockResolvedValue([]);

      await repository.findForExport({ statut: 'INACTIVE', q: 'bois' }, 5000);

      const { where, take, skip, orderBy, include } = prisma.categorie.findMany.mock.calls[0][0];
      expect(where).toEqual({
        statut: 'INACTIVE',
        nom: { contains: 'bois', mode: 'insensitive' },
      });
      expect(take).toBe(5000);
      expect(skip).toBeUndefined();
      expect(orderBy).toEqual([{ position: 'asc' }, { nom: 'asc' }]);
      expect(include).toEqual({ _count: { select: { oeuvres: true } } });
      expect(prisma.categorie.count).not.toHaveBeenCalled();
    });
  });

  describe('findCategorieById', () => {
    it('inclut le nombre d’œuvres via _count', async () => {
      const { repository, prisma } = buildRepository();
      prisma.categorie.findUnique.mockResolvedValue({ id: 'cat-1' });

      await repository.findCategorieById('cat-1');

      expect(prisma.categorie.findUnique).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
        include: { _count: { select: { oeuvres: true } } },
      });
    });
  });

  describe('listSousCategoriesByCategorie', () => {
    it('filtre par statut quand il est fourni', async () => {
      const { repository, prisma } = buildRepository();
      prisma.sousCategorie.findMany.mockResolvedValue([]);

      await repository.listSousCategoriesByCategorie('cat-1', 'ACTIVE');

      expect(prisma.sousCategorie.findMany).toHaveBeenCalledWith({
        where: { categorieId: 'cat-1', statut: 'ACTIVE' },
        orderBy: [{ position: 'asc' }, { nom: 'asc' }],
      });
    });

    it('filtre uniquement par categorieId quand le statut est absent', async () => {
      const { repository, prisma } = buildRepository();
      prisma.sousCategorie.findMany.mockResolvedValue([]);

      await repository.listSousCategoriesByCategorie('cat-1');

      expect(prisma.sousCategorie.findMany).toHaveBeenCalledWith({
        where: { categorieId: 'cat-1' },
        orderBy: [{ position: 'asc' }, { nom: 'asc' }],
      });
    });
  });
});