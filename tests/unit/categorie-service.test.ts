import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CategorieService } from '../../src/modules/categories/categorie.service';
import { ConflictError, NotFoundError, ValidationError } from '../../src/common/errors/AppError';
import { CategorieRepository } from '../../src/modules/categories/categorie.repository';
import { Prisma } from '../../src/generated/prisma/client';

function makeP2002(): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '7.9.1',
  });
}

function buildService(overrides: Partial<CategorieRepository> = {}) {
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
    ...overrides,
  } as unknown as CategorieRepository;
  return { service: new CategorieService(repository), repository };
}

describe('CategorieService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a category with a generated slug', async () => {
    const { service, repository } = buildService();
    repository.findCategorieByNom.mockResolvedValue(null);
    repository.findCategorieBySlug.mockResolvedValue(null);
    repository.createCategorie.mockResolvedValue({
      id: 'cat-1',
      nom: 'Sculpture',
      slug: 'sculpture',
    });

    const result = await service.createCategorie({ nom: '  Sculpture  ', description: 'd' });

    expect(repository.createCategorie).toHaveBeenCalledWith(
      expect.objectContaining({
        nom: 'Sculpture',
        description: 'd',
        slug: 'sculpture',
      })
    );
    expect(result.slug).toBe('sculpture');
  });

  it('creates a category with statut and position', async () => {
    const { service, repository } = buildService();
    repository.findCategorieByNom.mockResolvedValue(null);
    repository.findCategorieBySlug.mockResolvedValue(null);
    repository.createCategorie.mockResolvedValue({ id: 'cat-1' });

    await service.createCategorie({
      nom: 'Peinture',
      description: 'd',
      statut: 'INACTIVE',
      position: 3,
    });

    expect(repository.createCategorie).toHaveBeenCalledWith(
      expect.objectContaining({ statut: 'INACTIVE', position: 3, slug: 'peinture' })
    );
  });

  it('generates a slugified value for accents', async () => {
    const { service, repository } = buildService();
    repository.findCategorieByNom.mockResolvedValue(null);
    repository.findCategorieBySlug.mockResolvedValue(null);
    repository.createCategorie.mockResolvedValue({ id: 'cat-1' });

    await service.createCategorie({ nom: 'Ébénisterie', description: '' });

    expect(repository.createCategorie).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'ebenisterie' })
    );
  });

  it('disambiguates a duplicate slug by appending a suffix', async () => {
    const { service, repository } = buildService();
    repository.findCategorieByNom.mockResolvedValue(null);
    repository.findCategorieBySlug
      .mockResolvedValueOnce({ id: 'other', slug: 'sculpture' })
      .mockResolvedValueOnce(null);
    repository.createCategorie.mockResolvedValue({ id: 'cat-1' });

    await service.createCategorie({ nom: 'Sculpture', description: '' });

    expect(repository.createCategorie).toHaveBeenCalledWith(
      expect.objectContaining({ slug: 'sculpture-2' })
    );
  });

  it('rejects a duplicate category name', async () => {
    const { service, repository } = buildService();
    repository.findCategorieByNom.mockResolvedValue({ id: 'cat-1', nom: 'Sculpture' });

    await expect(
      service.createCategorie({ nom: 'Sculpture', description: '' })
    ).rejects.toThrow(ConflictError);
    expect(repository.createCategorie).not.toHaveBeenCalled();
  });

  it('returns a category with zero sous-categories', async () => {
    const { service, repository } = buildService();
    repository.findCategorieById.mockResolvedValue({
      id: 'cat-1',
      nom: 'Sculpture',
      sousCategories: [],
    });

    const result = await service.getCategorie('cat-1');
    expect(result.sousCategories).toEqual([]);
  });

  it('throws NotFoundError for an unknown category', async () => {
    const { service, repository } = buildService();
    repository.findCategorieById.mockResolvedValue(null);

    await expect(service.getCategorie('missing')).rejects.toThrow(NotFoundError);
  });

  it('refuses to delete a category that owns sous-categories', async () => {
    const { service, repository } = buildService();
    repository.findCategorieById.mockResolvedValue({ id: 'cat-1' });
    repository.countOeuvresByCategorie.mockResolvedValue(0);
    repository.countSousCategoriesByCategorie.mockResolvedValue(2);

    await expect(service.deleteCategorie('cat-1')).rejects.toThrow(ConflictError);
    expect(repository.deleteCategorie).not.toHaveBeenCalled();
  });

  it('refuses to delete a category that owns oeuvres', async () => {
    const { service, repository } = buildService();
    repository.findCategorieById.mockResolvedValue({ id: 'cat-1' });
    repository.countOeuvresByCategorie.mockResolvedValue(3);
    repository.countSousCategoriesByCategorie.mockResolvedValue(0);

    await expect(service.deleteCategorie('cat-1')).rejects.toThrow(ConflictError);
    expect(repository.deleteCategorie).not.toHaveBeenCalled();
  });

  it('deletes an orphan category and its image from cloudinary', async () => {
    const { service, repository } = buildService();
    repository.findCategorieById.mockResolvedValue({
      id: 'cat-1',
      imageCouverturePublicId: 'pub-1',
    });
    repository.countOeuvresByCategorie.mockResolvedValue(0);
    repository.countSousCategoriesByCategorie.mockResolvedValue(0);
    repository.deleteCategorie.mockResolvedValue({ id: 'cat-1' });
    repository.deleteImage.mockResolvedValue(undefined);

    await service.deleteCategorie('cat-1');
    expect(repository.deleteImage).toHaveBeenCalledWith('pub-1');
  });

  it('creates a sous-category linked to an existing category', async () => {
    const { service, repository } = buildService();
    repository.findCategorieById.mockResolvedValue({ id: 'cat-1' });
    repository.findSousCategorieInCategorie.mockResolvedValue(null);
    repository.findSousCategorieBySlug.mockResolvedValue(null);
    repository.createSousCategorie.mockResolvedValue({
      id: 'sc-1',
      nom: 'Sculpture sur bois',
      categorieId: 'cat-1',
    });

    const result = await service.createSousCategorie('cat-1', {
      nom: 'Sculpture sur bois',
      description: 'd',
    });

    expect(repository.createSousCategorie).toHaveBeenCalledWith(
      expect.objectContaining({
        nom: 'Sculpture sur bois',
        description: 'd',
        categorieId: 'cat-1',
        slug: 'sculpture-sur-bois',
      })
    );
    expect(result.categorieId).toBe('cat-1');
  });

  it('rejects a sous-category when the category does not exist', async () => {
    const { service, repository } = buildService();
    repository.findCategorieById.mockResolvedValue(null);

    await expect(
      service.createSousCategorie('missing', { nom: 'x', description: '' })
    ).rejects.toThrow(NotFoundError);
    expect(repository.createSousCategorie).not.toHaveBeenCalled();
  });

  it('rejects a duplicate sous-category within the same category', async () => {
    const { service, repository } = buildService();
    repository.findCategorieById.mockResolvedValue({ id: 'cat-1' });
    repository.findSousCategorieInCategorie.mockResolvedValue({ id: 'sc-1' });

    await expect(
      service.createSousCategorie('cat-1', { nom: 'Sculpture sur bois', description: '' })
    ).rejects.toThrow(ConflictError);
    expect(repository.createSousCategorie).not.toHaveBeenCalled();
  });

  it('allows the same sous-category name in different categories', async () => {
    const { service, repository } = buildService();
    repository.findCategorieById.mockResolvedValue({ id: 'cat-2' });
    repository.findSousCategorieInCategorie.mockResolvedValue(null);
    repository.findSousCategorieBySlug.mockResolvedValue(null);
    repository.createSousCategorie.mockResolvedValue({ id: 'sc-2' });

    const result = await service.createSousCategorie('cat-2', {
      nom: 'Sculpture sur bois',
      description: '',
    });

    expect(repository.createSousCategorie).toHaveBeenCalledWith(
      expect.objectContaining({ categorieId: 'cat-2', slug: 'sculpture-sur-bois' })
    );
    expect(result.id).toBe('sc-2');
  });

  it('lists the sous-categories of a category', async () => {
    const { service, repository } = buildService();
    repository.findCategorieById.mockResolvedValue({ id: 'cat-1' });
    repository.listSousCategoriesByCategorie.mockResolvedValue([
      { id: 'sc-1', nom: 'A' },
      { id: 'sc-2', nom: 'B' },
    ]);

    const result = await service.listSousCategoriesByCategorie('cat-1');
    expect(repository.listSousCategoriesByCategorie).toHaveBeenCalledWith('cat-1');
    expect(result).toHaveLength(2);
  });

  it('throws NotFoundError when listing sous-categories of an unknown category', async () => {
    const { service, repository } = buildService();
    repository.findCategorieById.mockResolvedValue(null);

    await expect(service.listSousCategoriesByCategorie('missing')).rejects.toThrow(NotFoundError);
  });

  it('lists categories with pagination and filters', async () => {
    const { service, repository } = buildService();
    repository.listCategories.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
    });

    await service.listCategories({ page: 1, limit: 20, statut: 'ACTIVE', q: 'sculp' });

    expect(repository.listCategories).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      statut: 'ACTIVE',
      q: 'sculp',
    });
  });

  it('uploads an image and replaces the previous one', async () => {
    const { service, repository } = buildService();
    repository.findCategorieById.mockResolvedValue({
      id: 'cat-1',
      imageCouverturePublicId: 'old-pub',
    });
    repository.uploadImage.mockResolvedValue({
      imageCouvertureUrl: 'https://cdn/x.jpg',
      imageCouverturePublicId: 'new-pub',
    });
    repository.updateCategorie.mockResolvedValue({ id: 'cat-1' });

    await service.uploadCategorieImage('cat-1', Buffer.from('data'), {
      domain: 'media',
      mimeType: 'image/png',
      bytes: 10,
    });

    expect(repository.deleteImage).toHaveBeenCalledWith('old-pub');
    expect(repository.updateCategorie).toHaveBeenCalledWith('cat-1', {
      imageCouvertureUrl: 'https://cdn/x.jpg',
      imageCouverturePublicId: 'new-pub',
    });
  });

  it('rejects an unsupported image mime type', async () => {
    const { service, repository } = buildService();
    repository.findCategorieById.mockResolvedValue({ id: 'cat-1' });

    await expect(
      service.uploadCategorieImage('cat-1', Buffer.from('data'), {
        domain: 'media',
        mimeType: 'application/pdf',
        bytes: 10,
      })
    ).rejects.toThrow(ValidationError);
  });

  it('maps an unexpected unique constraint violation on update to ConflictError', async () => {
    const { service, repository } = buildService();
    repository.findCategorieById.mockResolvedValue({ id: 'cat-1', slug: 'a' });
    repository.updateCategorie.mockRejectedValue(makeP2002());

    await expect(service.updateCategorie('cat-1', { description: 'x' })).rejects.toThrow(
      ConflictError
    );
  });

  it('maps a delete constraint violation to a ConflictError', async () => {
    const { service, repository } = buildService();
    repository.findCategorieById.mockResolvedValue({ id: 'cat-1' });
    repository.countOeuvresByCategorie.mockResolvedValue(0);
    repository.countSousCategoriesByCategorie.mockResolvedValue(0);
    repository.deleteCategorie.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('FK fails', {
        code: 'P2003',
        clientVersion: '7.9.1',
      })
    );

    await expect(service.deleteCategorie('cat-1')).rejects.toThrow(ConflictError);
  });
});
