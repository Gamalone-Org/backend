import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CategorieArticleService } from '../../src/modules/categories-article/categorie-article.service.js';
import { NotFoundError, ConflictError, ValidationError } from '../../src/common/errors/AppError.js';

vi.mock('../../src/modules/categories/slug.util.js', () => ({
  uniqueSlug: vi.fn(async (base: string, used: (slug: string) => Promise<boolean>) => {
    const slugify = (input: string) =>
      input
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 150);
    const baseSlug = slugify(base) || 'item';
    let candidate = baseSlug;
    let i = 2;
    while (await used(candidate)) {
      candidate = `${baseSlug}-${i}`;
      i += 1;
    }
    return candidate;
  }),
}));

function buildService(overrides: Record<string, unknown> = {}) {
  const repository = {
    findCategorieArticleById: vi.fn(),
    findCategorieArticleByNom: vi.fn(),
    findCategorieArticleBySlug: vi.fn(),
    countArticlesByCategorieArticle: vi.fn(),
    listCategoriesArticle: vi.fn(),
    createCategorieArticle: vi.fn(),
    updateCategorieArticle: vi.fn(),
    deleteCategorieArticle: vi.fn(),
    uploadImage: vi.fn(),
    deleteImage: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as any;
  return { service: new CategorieArticleService(repository), repository };
}

describe('CategorieArticleService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listCategoriesArticle', () => {
    it('calcule totalPages = ceil(total / limit)', async () => {
      const { service, repository } = buildService();
      repository.listCategoriesArticle.mockResolvedValue({ items: [], total: 21, page: 2, limit: 10 });

      const result = await service.listCategoriesArticle({ page: 2, limit: 10 });

      expect(result.totalPages).toBe(3);
      expect(result.total).toBe(21);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
    });

    it('retourne totalPages = 0 quand total = 0', async () => {
      const { service, repository } = buildService();
      repository.listCategoriesArticle.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

      const result = await service.listCategoriesArticle({ page: 1, limit: 20 });

      expect(result.totalPages).toBe(0);
    });
  });

  describe('createCategorieArticle', () => {
    it('crée une catégorie d\'article avec slug auto-généré', async () => {
      const { service, repository } = buildService();
      repository.findCategorieArticleByNom.mockResolvedValue(null);
      repository.findCategorieArticleBySlug.mockResolvedValue(null);
      repository.createCategorieArticle.mockResolvedValue({
        id: 'cat-1',
        nom: 'Peinture',
        description: 'Œuvres picturales',
        slug: 'peinture',
        statut: 'ACTIVE',
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const result = await service.createCategorieArticle({ nom: 'Peinture', description: 'Œuvres picturales' });

      expect(repository.findCategorieArticleByNom).toHaveBeenCalledWith('Peinture');
      const createCall = repository.createCategorieArticle.mock.calls[0][0];
      expect(createCall.nom).toBe('Peinture');
      expect(createCall.description).toBe('Œuvres picturales');
      expect(createCall.slug).toMatch(/^peinture/);
      // statut non fourni => pas dans l'appel, le défaut DB (ACTIVE) s'applique
      expect(createCall.statut).toBeUndefined();
      expect(result.nom).toBe('Peinture');
    });

    it('rejette un nom en double', async () => {
      const { service, repository } = buildService();
      repository.findCategorieArticleByNom.mockResolvedValue({ id: 'existing', nom: 'Peinture' });

      await expect(service.createCategorieArticle({ nom: 'Peinture' })).rejects.toThrow(ConflictError);
    });
  });

  describe('updateCategorieArticle', () => {
    it('met à jour le nom et régénère le slug', async () => {
      const { service, repository } = buildService();
      repository.findCategorieArticleById.mockResolvedValue({
        id: 'cat-1',
        nom: 'Peinture',
        slug: 'peinture',
        statut: 'ACTIVE',
      });
      repository.findCategorieArticleByNom.mockResolvedValue(null);
      repository.findCategorieArticleBySlug.mockResolvedValue(null);
      repository.updateCategorieArticle.mockResolvedValue({
        id: 'cat-1',
        nom: 'Dessin',
        slug: 'dessin',
        statut: 'ACTIVE',
      });

      const result = await service.updateCategorieArticle('cat-1', { nom: 'Dessin' });

      expect(repository.updateCategorieArticle).toHaveBeenCalledWith('cat-1', expect.objectContaining({
        nom: 'Dessin',
        slug: expect.stringMatching(/^dessin/),
      }));
      expect(result.nom).toBe('Dessin');
    });

    it('rejette un nom en double (hors soi-même)', async () => {
      const { service, repository } = buildService();
      repository.findCategorieArticleById.mockResolvedValue({ id: 'cat-1', nom: 'Peinture' });
      repository.findCategorieArticleByNom.mockResolvedValue({ id: 'cat-2', nom: 'Dessin' });

      await expect(service.updateCategorieArticle('cat-1', { nom: 'Dessin' })).rejects.toThrow(ConflictError);
    });

    it('autorise la mise à jour si le nom reste inchangé', async () => {
      const { service, repository } = buildService();
      repository.findCategorieArticleById.mockResolvedValue({ id: 'cat-1', nom: 'Peinture', slug: 'peinture' });
      repository.updateCategorieArticle.mockResolvedValue({ id: 'cat-1', nom: 'Peinture', statut: 'INACTIVE' });

      const result = await service.updateCategorieArticle('cat-1', { statut: 'INACTIVE' });

      expect(result.statut).toBe('INACTIVE');
    });
  });

  describe('deleteCategorieArticle', () => {
    it('supprime une catégorie sans articles', async () => {
      const { service, repository } = buildService();
      repository.findCategorieArticleById.mockResolvedValue({
        id: 'cat-1',
        nom: 'Peinture',
        imageCouverturePublicId: null,
      });
      repository.countArticlesByCategorieArticle.mockResolvedValue(0);
      repository.deleteCategorieArticle.mockResolvedValue({ id: 'cat-1' });

      await service.deleteCategorieArticle('cat-1');

      expect(repository.deleteCategorieArticle).toHaveBeenCalledWith('cat-1');
    });

    it('bloque la suppression si des articles y sont rattachés', async () => {
      const { service, repository } = buildService();
      repository.findCategorieArticleById.mockResolvedValue({ id: 'cat-1', nom: 'Peinture' });
      repository.countArticlesByCategorieArticle.mockResolvedValue(3);

      await expect(service.deleteCategorieArticle('cat-1')).rejects.toThrow(ConflictError);
    });

    it('retourne 404 si la catégorie n\'existe pas', async () => {
      const { service, repository } = buildService();
      repository.findCategorieArticleById.mockResolvedValue(null);

      await expect(service.deleteCategorieArticle('missing')).rejects.toThrow(NotFoundError);
    });
  });

  describe('getCategorieArticle', () => {
    it('retourne la catégorie trouvée', async () => {
      const { service, repository } = buildService();
      repository.findCategorieArticleById.mockResolvedValue({ id: 'cat-1', nom: 'Peinture' });

      const result = await service.getCategorieArticle('cat-1');

      expect(result.nom).toBe('Peinture');
    });

    it('retourne 404 si la catégorie n\'existe pas', async () => {
      const { service, repository } = buildService();
      repository.findCategorieArticleById.mockResolvedValue(null);

      await expect(service.getCategorieArticle('missing')).rejects.toThrow(NotFoundError);
    });
  });

  describe('uploadCategorieArticleImage', () => {
    it('upload et met à jour l\'image de couverture', async () => {
      const { service, repository } = buildService();
      repository.findCategorieArticleById.mockResolvedValue({ id: 'cat-1', imageCouverturePublicId: null });
      repository.uploadImage.mockResolvedValue({
        imageCouvertureUrl: 'https://cdn.test/image.jpg',
        imageCouverturePublicId: 'test/image',
      });
      repository.updateCategorieArticle.mockResolvedValue({
        id: 'cat-1',
        imageCouvertureUrl: 'https://cdn.test/image.jpg',
      });

      const result = await service.uploadCategorieArticleImage('cat-1', { buffer: Buffer.from('x'), mimeType: 'image/jpeg', bytes: 1 }, { domain: 'articles', mimeType: 'image/jpeg', bytes: 1 });

      expect(result.imageCouvertureUrl).toBe('https://cdn.test/image.jpg');
    });

    it('rejette un MIME type invalide', async () => {
      const { service, repository } = buildService();
      repository.findCategorieArticleById.mockResolvedValue({ id: 'cat-1' });

      await expect(
        service.uploadCategorieArticleImage('cat-1', { buffer: Buffer.from('x'), mimeType: 'application/pdf', bytes: 1 }, { domain: 'articles', mimeType: 'application/pdf', bytes: 1 })
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('deleteCategorieArticleImage', () => {
    it('supprime l\'image et met les champs à null', async () => {
      const { service, repository } = buildService();
      repository.findCategorieArticleById.mockResolvedValue({
        id: 'cat-1',
        imageCouverturePublicId: 'test/image',
      });
      repository.deleteImage.mockResolvedValue(undefined);
      repository.updateCategorieArticle.mockResolvedValue({
        id: 'cat-1',
        imageCouvertureUrl: null,
        imageCouverturePublicId: null,
      });

      const result = await service.deleteCategorieArticleImage('cat-1');

      expect(result.imageCouvertureUrl).toBeNull();
      expect(result.imageCouverturePublicId).toBeNull();
    });

    it('retourne 404 si pas d\'image définie', async () => {
      const { service, repository } = buildService();
      repository.findCategorieArticleById.mockResolvedValue({ id: 'cat-1', imageCouverturePublicId: null });

      await expect(service.deleteCategorieArticleImage('cat-1')).rejects.toThrow(NotFoundError);
    });
  });
});