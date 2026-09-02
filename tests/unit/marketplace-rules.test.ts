import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OeuvreService } from '../../src/modules/marketplace/oeuvre.service';
import { ForbiddenError, ConflictError, NotFoundError } from '../../src/common/errors/AppError';

function buildService(overrides = {}) {
  const repository = {
    findArtisanProfileById: vi.fn(),
    findById: vi.fn(),
    countMedias: vi.fn(),
    countLignesCommande: vi.fn(),
    findCategorieById: vi.fn(),
    invalidateCertificat: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    withdraw: vi.fn(),
    findAdminProfileByUserId: vi.fn(),
    publish: vi.fn(),
    ...overrides,
  } as any;
  return { service: new OeuvreService(repository), repository };
}

describe('OeuvreService business rules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('forbids update of a PUBLIEE oeuvre', async () => {
    const { service, repository } = buildService();
    repository.findById.mockResolvedValue({ id: 'oeuvre-1', statut: 'PUBLIEE', artisanId: 'artisan-1' });

    await expect(service.updateOeuvre('oeuvre-1', { titre: 'x' })).rejects.toThrow(ConflictError);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('allows update of an EN_ATTENTE_VALIDATION oeuvre', async () => {
    const { service, repository } = buildService();
    repository.findById.mockResolvedValue({
      id: 'oeuvre-1',
      statut: 'EN_ATTENTE_VALIDATION',
      artisanId: 'artisan-1',
    });
    repository.update.mockResolvedValue({ id: 'oeuvre-1' });

    const result = await service.updateOeuvre('oeuvre-1', { titre: 'x' });
    expect(repository.update).toHaveBeenCalledWith('oeuvre-1', { titre: 'x' });
    expect(result.id).toBe('oeuvre-1');
  });

  it('forbids delete of a non-brouillon oeuvre', async () => {
    const { service, repository } = buildService();
    repository.findById.mockResolvedValue({ id: 'oeuvre-1', statut: 'PUBLIEE', artisanId: 'artisan-1' });

    await expect(service.deleteOeuvre('oeuvre-1')).rejects.toThrow(ConflictError);
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('validates categorie existence on update when categorieId provided', async () => {
    const { service, repository } = buildService();
    repository.findById.mockResolvedValue({ id: 'oeuvre-1', statut: 'BROUILLON', artisanId: 'artisan-1' });
    repository.findCategorieById.mockResolvedValue(null);

    await expect(
      service.updateOeuvre('oeuvre-1', { categorieId: 'missing' })
    ).rejects.toThrow(NotFoundError);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('throws NotFoundError for unknown categorie on create', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileById.mockResolvedValue({ id: 'artisan-1', user: { role: 'ARTISAN', statut: 'ACTIF' } });
    repository.findCategorieById.mockResolvedValue(null);

    await expect(
      service.createOeuvre('artisan-1', {
        titre: 'T',
        description: 'D',
        technique: 'T',
        materiaux: 'M',
        dimensions: 'D',
        anneeCreation: 2023,
        prixXOF: 100,
        categorieId: 'missing',
      })
    ).rejects.toThrow(NotFoundError);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('allows update of a brouillon with a valid categorie', async () => {
    const { service, repository } = buildService();
    repository.findById.mockResolvedValue({ id: 'oeuvre-1', statut: 'BROUILLON', artisanId: 'artisan-1' });
    repository.findCategorieById.mockResolvedValue({ id: 'cat-new' });
    repository.update.mockResolvedValue({ id: 'oeuvre-1' });

    const result = await service.updateOeuvre('oeuvre-1', { categorieId: 'cat-new' });
    expect(repository.update).toHaveBeenCalledWith('oeuvre-1', { categorieId: 'cat-new' });
    expect(result.id).toBe('oeuvre-1');
  });

  it('createOeuvre throws NotFoundError when artisan profile is missing', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileById.mockResolvedValue(null);

    await expect(
      service.createOeuvre('artisan-missing', {
        titre: 'T',
        description: 'D',
        technique: 'T',
        materiaux: 'M',
        dimensions: 'D',
        anneeCreation: 2023,
        prixXOF: 100,
        categorieId: 'cat-1',
      })
    ).rejects.toThrow(NotFoundError);
  });

  it('createOeuvre throws ForbiddenError when role is not ARTISAN', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileById.mockResolvedValue({ id: 'u-1', user: { role: 'ACHETEUR', statut: 'ACTIF' } });

    await expect(
      service.createOeuvre('u-1', {
        titre: 'T',
        description: 'D',
        technique: 'T',
        materiaux: 'M',
        dimensions: 'D',
        anneeCreation: 2023,
        prixXOF: 100,
        categorieId: 'cat-1',
      })
    ).rejects.toThrow(ForbiddenError);
  });

  it('createOeuvre throws ForbiddenError when statut is not ACTIF', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileById.mockResolvedValue({ id: 'u-1', user: { role: 'ARTISAN', statut: 'INACTIF' } });

    await expect(
      service.createOeuvre('u-1', {
        titre: 'T',
        description: 'D',
        technique: 'T',
        materiaux: 'M',
        dimensions: 'D',
        anneeCreation: 2023,
        prixXOF: 100,
        categorieId: 'cat-1',
      })
    ).rejects.toThrow(ForbiddenError);
  });
});
