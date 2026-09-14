import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CategorieService, CSV_EXPORT_LIMIT } from '../../src/modules/categories/categorie.service';
import { NotFoundError } from '../../src/common/errors/AppError';

function buildService(overrides: Record<string, unknown> = {}) {
  const repository = {
    findCategorieById: vi.fn(),
    findCategorieByNom: vi.fn(),
    findCategorieBySlug: vi.fn(),
    countOeuvresByCategorie: vi.fn(),
    countSousCategoriesByCategorie: vi.fn(),
    listCategories: vi.fn(),
    createCategorie: vi.fn(),
    updateCategorie: vi.fn(),
    deleteCategorie: vi.fn(),
    uploadImage: vi.fn(),
    deleteImage: vi.fn().mockResolvedValue(undefined),
    createSousCategorie: vi.fn(),
    updateSousCategorie: vi.fn(),
    deleteSousCategorie: vi.fn(),
    findSousCategorieById: vi.fn(),
    findSousCategorieBySlug: vi.fn(),
    findSousCategorieInCategorie: vi.fn(),
    listSousCategoriesByCategorie: vi.fn(),
    findForExport: vi.fn(),
    ...overrides,
  } as any;
  return { service: new CategorieService(repository), repository };
}

describe('Phase 2 — CategorieService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('totalPages', () => {
    it('calcule totalPages = ceil(total / limit)', async () => {
      const { service, repository } = buildService();
      repository.listCategories.mockResolvedValue({ items: [], total: 21, page: 2, limit: 10 });

      const result = await service.listCategories({ page: 2, limit: 10 });

      expect(result.totalPages).toBe(3);
      expect(result.total).toBe(21);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
    });

    it('retourne totalPages = 0 quand total = 0', async () => {
      const { service, repository } = buildService();
      repository.listCategories.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

      const result = await service.listCategories({ page: 1, limit: 20 });

      expect(result.totalPages).toBe(0);
    });
  });

  describe('visibilité publique ACTIVE', () => {
    it('listPublicCategories force statut ACTIVE', async () => {
      const { service, repository } = buildService();
      repository.listCategories.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });

      await service.listPublicCategories({ page: 1, limit: 20, q: 'sculp' });

      expect(repository.listCategories).toHaveBeenCalledWith({
        page: 1,
        limit: 20,
        q: 'sculp',
        statut: 'ACTIVE',
      });
    });

    it('getPublicCategorie retourne une catégorie ACTIVE', async () => {
      const { service, repository } = buildService();
      repository.findCategorieById.mockResolvedValue({ id: 'cat-1', statut: 'ACTIVE' });

      const result = await service.getPublicCategorie('cat-1');

      expect(result.statut).toBe('ACTIVE');
    });

    it('getPublicCategorie lève NotFound pour une catégorie INACTIVE', async () => {
      const { service, repository } = buildService();
      repository.findCategorieById.mockResolvedValue({ id: 'cat-1', statut: 'INACTIVE' });

      await expect(service.getPublicCategorie('cat-1')).rejects.toThrow(NotFoundError);
    });

    it('getPublicCategorie lève NotFound si la catégorie est absente', async () => {
      const { service, repository } = buildService();
      repository.findCategorieById.mockResolvedValue(null);

      await expect(service.getPublicCategorie('missing')).rejects.toThrow(NotFoundError);
    });

    it('listPublicSousCategories ne renvoie que les sous-catégories ACTIVE d’une catégorie ACTIVE', async () => {
      const { service, repository } = buildService();
      repository.findCategorieById.mockResolvedValue({ id: 'cat-1', statut: 'ACTIVE' });
      repository.listSousCategoriesByCategorie.mockResolvedValue([{ id: 'sc-1' }, { id: 'sc-2' }]);

      const result = await service.listPublicSousCategories('cat-1');

      expect(repository.listSousCategoriesByCategorie).toHaveBeenCalledWith('cat-1', 'ACTIVE');
      expect(result).toHaveLength(2);
    });

    it('listPublicSousCategories lève NotFound et ne liste rien si la catégorie est INACTIVE', async () => {
      const { service, repository } = buildService();
      repository.findCategorieById.mockResolvedValue({ id: 'cat-1', statut: 'INACTIVE' });

      await expect(service.listPublicSousCategories('cat-1')).rejects.toThrow(NotFoundError);
      expect(repository.listSousCategoriesByCategorie).not.toHaveBeenCalled();
    });

    it('listPublicSousCategories lève NotFound si la catégorie est absente', async () => {
      const { service, repository } = buildService();
      repository.findCategorieById.mockResolvedValue(null);

      await expect(service.listPublicSousCategories('missing')).rejects.toThrow(NotFoundError);
    });
  });

  describe('cohérence categorieId des sous-catégories', () => {
    it('updateSousCategorie lève NotFound quand la sous-catégorie n’appartient pas au categorieId', async () => {
      const { service, repository } = buildService();
      repository.findSousCategorieById.mockResolvedValue({ id: 'sc-1', categorieId: 'cat-1', slug: 'x' });

      await expect(
        service.updateSousCategorie('cat-2', 'sc-1', { nom: 'Nouveau' })
      ).rejects.toThrow(NotFoundError);
      expect(repository.updateSousCategorie).not.toHaveBeenCalled();
    });

    it('updateSousCategorie met à jour quand la sous-catégorie appartient au categorieId', async () => {
      const { service, repository } = buildService();
      repository.findSousCategorieById.mockResolvedValue({
        id: 'sc-1',
        categorieId: 'cat-1',
        slug: 'x',
      });
      repository.findSousCategorieBySlug.mockResolvedValue(null);
      repository.updateSousCategorie.mockResolvedValue({ id: 'sc-1', nom: 'Nouveau', slug: 'nouveau' });

      const result = await service.updateSousCategorie('cat-1', 'sc-1', { nom: 'Nouveau' });

      expect(repository.updateSousCategorie).toHaveBeenCalledWith(
        'sc-1',
        expect.objectContaining({ nom: 'Nouveau', slug: 'nouveau' })
      );
      expect(result.nom).toBe('Nouveau');
    });

    it('deleteSousCategorie lève NotFound et ne supprime pas quand le categorieId ne correspond pas', async () => {
      const { service, repository } = buildService();
      repository.findSousCategorieById.mockResolvedValue({ id: 'sc-1', categorieId: 'cat-1' });

      await expect(service.deleteSousCategorie('cat-2', 'sc-1')).rejects.toThrow(NotFoundError);
      expect(repository.deleteSousCategorie).not.toHaveBeenCalled();
    });

    it('deleteSousCategorie supprime quand la sous-catégorie appartient au categorieId', async () => {
      const { service, repository } = buildService();
      repository.findSousCategorieById.mockResolvedValue({ id: 'sc-1', categorieId: 'cat-1' });
      repository.deleteSousCategorie.mockResolvedValue({ id: 'sc-1' });

      const result = await service.deleteSousCategorie('cat-1', 'sc-1');

      expect(repository.deleteSousCategorie).toHaveBeenCalledWith('sc-1');
      expect(result.id).toBe('sc-1');
    });
  });

  describe('export CSV', () => {
    const fake = {
      id: 'cat-1',
      nom: 'Sculpture',
      description: 'Art, "bois" & pierre',
      slug: 'sculpture',
      statut: 'ACTIVE',
      position: 1,
      _count: { oeuvres: 12 },
      imageCouvertureUrl: 'https://cdn/x.jpg',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };

    it('utilise findForExport avec la limite CSV_EXPORT_LIMIT et les filtres', async () => {
      const { service, repository } = buildService();
      repository.findForExport.mockResolvedValue([fake]);

      await service.exportCsv({ statut: 'ACTIVE', q: 'sculp' });

      expect(repository.findForExport).toHaveBeenCalledWith({ statut: 'ACTIVE', q: 'sculp' }, CSV_EXPORT_LIMIT);
      expect(CSV_EXPORT_LIMIT).toBe(5000);
    });

    it('génère le CSV avec l’en-tête attendu, le nombre d’œuvres et l’échappement', async () => {
      const { service, repository } = buildService();
      repository.findForExport.mockResolvedValue([fake]);

      const csv = await service.exportCsv({});

      const lines = csv.split('\n');
      expect(lines[0]).toBe(
        '"id","nom","description","slug","statut","position","nombre_oeuvres","imageCouvertureUrl","createdAt"'
      );
      expect(csv).toContain('"Art, ""bois"" & pierre"');
      expect(csv).toContain('"12"');
      expect(csv).toContain('"2026-01-01T00:00:00.000Z"');
    });

    it('n’expose pas imageCouverturePublicId dans le CSV', async () => {
      const { service, repository } = buildService();
      repository.findForExport.mockResolvedValue([
        { ...fake, imageCouverturePublicId: 'pub-secret' },
      ]);

      const csv = await service.exportCsv({});

      expect(csv).not.toContain('imageCouverturePublicId');
      expect(csv).not.toContain('pub-secret');
    });

    it('rend une cellule vide pour imageCouvertureUrl absente', async () => {
      const { service, repository } = buildService();
      repository.findForExport.mockResolvedValue([{ ...fake, imageCouvertureUrl: null }]);

      const csv = await service.exportCsv({});
      const row = csv.split('\n')[1];

      expect(row).toContain('"","');
    });
  });
});