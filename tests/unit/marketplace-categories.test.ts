import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OeuvreService } from '../../src/modules/marketplace/oeuvre.service';
import { NotFoundError } from '../../src/common/errors/AppError';

function buildService(overrides = {}) {
  const repository = {
    findArtisanProfileById: vi.fn(),
    findCategorieById: vi.fn(),
    findById: vi.fn(),
    countMedias: vi.fn(),
    countLignesCommande: vi.fn(),
    invalidateCertificat: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    withdraw: vi.fn(),
    ...overrides,
  } as any;
  return { service: new OeuvreService(repository), repository };
}

describe('OeuvreService category integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const input = {
    titre: 'T',
    description: 'D',
    technique: 'T',
    materiaux: 'M',
    dimensions: 'D',
    anneeCreation: 2023,
    prixXOF: 100,
    categorieId: 'cat-1',
  };

  it('creates an oeuvre only when the categorie exists', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileById.mockResolvedValue({ id: 'artisan-1', user: { role: 'ARTISAN', statut: 'ACTIF' } });
    repository.findCategorieById.mockResolvedValue({ id: 'cat-1', nom: 'Sculpture' });
    repository.create.mockResolvedValue({ id: 'oeuvre-1', categorieId: 'cat-1' });

    const result = await service.createOeuvre('artisan-1', input);
    expect(repository.findCategorieById).toHaveBeenCalledWith('cat-1');
    expect(result.categorieId).toBe('cat-1');
  });

  it('rejects creation with an unknown category', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileById.mockResolvedValue({ id: 'artisan-1', user: { role: 'ARTISAN', statut: 'ACTIF' } });
    repository.findCategorieById.mockResolvedValue(null);

    await expect(service.createOeuvre('artisan-1', input)).rejects.toThrow(NotFoundError);
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects update to an unknown category', async () => {
    const { service, repository } = buildService();
    repository.findById.mockResolvedValue({ id: 'oeuvre-1', statut: 'BROUILLON', artisanId: 'artisan-1' });
    repository.findCategorieById.mockResolvedValue(null);

    await expect(
      service.updateOeuvre('oeuvre-1', { categorieId: 'missing' })
    ).rejects.toThrow(NotFoundError);
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('does not verify category when categorieId is absent in update', async () => {
    const { service, repository } = buildService();
    repository.findById.mockResolvedValue({ id: 'oeuvre-1', statut: 'BROUILLON', artisanId: 'artisan-1' });
    repository.update.mockResolvedValue({ id: 'oeuvre-1' });

    const result = await service.updateOeuvre('oeuvre-1', { titre: 'Nouveau' });
    expect(repository.findCategorieById).not.toHaveBeenCalled();
    expect(repository.update).toHaveBeenCalledWith('oeuvre-1', { titre: 'Nouveau' });
    expect(result.id).toBe('oeuvre-1');
  });
});
