import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CategorieArticleRepository } from '../../src/modules/categories-article/categorie-article.repository.js';

function buildRepo(overrides: Record<string, unknown> = {}) {
  const prisma = {
    categorieArticle: {
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
    },
    article: {
      count: vi.fn(),
    },
    $transaction: vi.fn(),
    ...overrides,
  } as any;
  const cloudinaryFactory = vi.fn().mockReturnValue({
    uploadImage: vi.fn(),
    deleteAsset: vi.fn(),
  });
  return new CategorieArticleRepository(prisma, cloudinaryFactory);
}

describe('CategorieArticleRepository', () => {
  let repo: CategorieArticleRepository;

  beforeEach(() => {
    repo = buildRepo();
    vi.clearAllMocks();
  });

  describe('createCategorieArticle', () => {
    it('appelle prisma.categorieArticle.create avec les bonnes données', async () => {
      const data = {
        nom: 'Peinture',
        description: 'Œuvres picturales',
        slug: 'peinture',
        statut: 'ACTIVE',
      };
      const expected = { id: 'cat-1', ...data, createdAt: new Date(), updatedAt: new Date() };
      repo.prisma.categorieArticle.create.mockResolvedValue(expected);

      const result = await repo.createCategorieArticle(data);

      expect(repo.prisma.categorieArticle.create).toHaveBeenCalledWith({ data });
      expect(result).toEqual(expected);
    });
  });

  describe('updateCategorieArticle', () => {
    it('appelle prisma.categorieArticle.update', async () => {
      const data = { nom: 'Dessin' };
      const expected = { id: 'cat-1', ...data, slug: 'dessin', statut: 'ACTIVE' };
      repo.prisma.categorieArticle.update.mockResolvedValue(expected);

      const result = await repo.updateCategorieArticle('cat-1', data);

      expect(repo.prisma.categorieArticle.update).toHaveBeenCalledWith({ where: { id: 'cat-1' }, data });
      expect(result).toEqual(expected);
    });
  });

  describe('deleteCategorieArticle', () => {
    it('appelle prisma.categorieArticle.delete', async () => {
      repo.prisma.categorieArticle.delete.mockResolvedValue({ id: 'cat-1' });

      const result = await repo.deleteCategorieArticle('cat-1');

      expect(repo.prisma.categorieArticle.delete).toHaveBeenCalledWith({ where: { id: 'cat-1' } });
      expect(result).toEqual({ id: 'cat-1' });
    });
  });

  describe('findCategorieArticleById', () => {
    it('retourne la catégorie avec le compte d\'articles', async () => {
      const expected = { id: 'cat-1', nom: 'Peinture', _count: { articles: 5 } };
      repo.prisma.categorieArticle.findUnique.mockResolvedValue(expected);

      const result = await repo.findCategorieArticleById('cat-1');

      expect(repo.prisma.categorieArticle.findUnique).toHaveBeenCalledWith({
        where: { id: 'cat-1' },
        include: { _count: { select: { articles: true } } },
      });
      expect(result).toEqual(expected);
    });
  });

  describe('findCategorieArticleByNom', () => {
    it('cherche par nom', async () => {
      const expected = { id: 'cat-1', nom: 'Peinture' };
      repo.prisma.categorieArticle.findUnique.mockResolvedValue(expected);

      const result = await repo.findCategorieArticleByNom('Peinture');

      expect(repo.prisma.categorieArticle.findUnique).toHaveBeenCalledWith({ where: { nom: 'Peinture' } });
      expect(result).toEqual(expected);
    });
  });

  describe('findCategorieArticleBySlug', () => {
    it('cherche par slug', async () => {
      const expected = { id: 'cat-1', slug: 'peinture' };
      repo.prisma.categorieArticle.findUnique.mockResolvedValue(expected);

      const result = await repo.findCategorieArticleBySlug('peinture');

      expect(repo.prisma.categorieArticle.findUnique).toHaveBeenCalledWith({ where: { slug: 'peinture' } });
      expect(result).toEqual(expected);
    });
  });

  describe('countArticlesByCategorieArticle', () => {
    it('compte les articles liés', async () => {
      repo.prisma.article.count.mockResolvedValue(7);

      const result = await repo.countArticlesByCategorieArticle('cat-1');

      expect(repo.prisma.article.count).toHaveBeenCalledWith({ where: { categorieId: 'cat-1' } });
      expect(result).toBe(7);
    });
  });

  describe('listCategoriesArticle', () => {
    it('retourne la liste paginée avec ordre alphabétique et compte d\'articles', async () => {
      const items = [
        { id: 'cat-1', nom: 'Dessin', _count: { articles: 3 } },
        { id: 'cat-2', nom: 'Peinture', _count: { articles: 5 } },
      ];
      repo.prisma.$transaction.mockResolvedValue([2, items]);
      repo.prisma.categorieArticle.count.mockResolvedValue(2);

      const result = await repo.listCategoriesArticle({ page: 1, limit: 20, statut: 'ACTIVE', q: 'peint' });

      expect(repo.prisma.$transaction).toHaveBeenCalled();
      expect(result).toEqual({ items, total: 2, page: 1, limit: 20 });
    });
  });

  describe('buildWhere', () => {
    it('construit le where sans filtres', () => {
      const where = repo.buildWhere({});
      expect(where).toEqual({});
    });

    it('ajoute le filtre statut', () => {
      const where = repo.buildWhere({ statut: 'ACTIVE' });
      expect(where).toEqual({ statut: 'ACTIVE' });
    });

    it('ajoute la recherche full-text sur le nom', () => {
      const where = repo.buildWhere({ q: 'peint' });
      expect(where).toEqual({ nom: { contains: 'peint', mode: 'insensitive' } });
    });
  });

  describe('uploadImage', () => {
    it('upload vers Cloudinary et retourne URL + publicId', async () => {
      const cloudinary = {
        uploadImage: vi.fn().mockResolvedValue({ secureUrl: 'https://cdn.test/image.jpg', publicId: 'test/image' }),
      };
      repo.cloudinaryInstance = cloudinary;

      const result = await repo.uploadImage({ buffer: Buffer.from('x'), mimeType: 'image/jpeg', bytes: 1 }, { domain: 'articles', mimeType: 'image/jpeg', bytes: 1 });

      expect(cloudinary.uploadImage).toHaveBeenCalled();
      expect(result).toEqual({ imageCouvertureUrl: 'https://cdn.test/image.jpg', imageCouverturePublicId: 'test/image' });
    });
  });

  describe('deleteImage', () => {
    it('supprime l\'asset Cloudinary', async () => {
      const cloudinary = { deleteAsset: vi.fn().mockResolvedValue(undefined) };
      repo.cloudinaryInstance = cloudinary;

      await repo.deleteImage('test/image');

      expect(cloudinary.deleteAsset).toHaveBeenCalledWith('test/image', 'image');
    });
  });
});