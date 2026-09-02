import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OeuvreService } from '../../src/modules/marketplace/oeuvre.service';

function buildService(overrides = {}) {
  const repository = {
    findPublishedPublic: vi.fn(),
    findFeatured: vi.fn(),
    findPublishedByArtisan: vi.fn(),
    findArtisanProfileByUserId: vi.fn(),
    findByIdPublic: vi.fn(),
    ...overrides,
  } as any;
  return { service: new OeuvreService(repository), repository };
}

const select = {} as any;

describe('OeuvreService public filters & pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('passes pagination and filter args to the repository', async () => {
    const { service, repository } = buildService();
    repository.findPublishedPublic.mockResolvedValue({ oeuvres: [], total: 0 });

    await service.getPublishedPublic(
      2,
      30,
      {
        categorieId: 'cat-1',
        prixMin: 100,
        prixMax: 500,
        artisanType: 'ARTISTE',
        localisation: 'Lomé',
        q: 'sculpture',
        tri: 'prixXOF_asc',
      },
      select
    );

    expect(repository.findPublishedPublic).toHaveBeenCalledWith(
      2,
      30,
      {
        categorieId: 'cat-1',
        prixMin: 100,
        prixMax: 500,
        artisanType: 'ARTISTE',
        localisation: 'Lomé',
        q: 'sculpture',
        tri: 'prixXOF_asc',
      },
      select
    );
  });

  it('returns featured oeuvres', async () => {
    const { service, repository } = buildService();
    repository.findFeatured.mockResolvedValue([{ id: 'oeuvre-1' }]);

    const result = await service.getFeatured(5, select);
    expect(repository.findFeatured).toHaveBeenCalledWith(5, select);
    expect(result).toHaveLength(1);
  });

  it('lists published oeuvres of an artisan with pagination', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileByUserId.mockResolvedValue({ id: 'artisan-1' });
    repository.findPublishedByArtisan.mockResolvedValue({ oeuvres: [], total: 0 });

    const result = await service.getOeuvresByArtisanPublic('user-1', 1, 10, select);

    expect(repository.findPublishedByArtisan).toHaveBeenCalledWith('artisan-1', 1, 10, select);
    expect(result.total).toBe(0);
  });

  it('throws NotFoundError for an unknown artisan when listing public oeuvres', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileByUserId.mockResolvedValue(null);

    await expect(
      service.getOeuvresByArtisanPublic('unknown', 1, 10, select)
    ).rejects.toThrowError();
    expect(repository.findPublishedByArtisan).not.toHaveBeenCalled();
  });

  it('returns an oeuvre public detail only when published', async () => {
    const { service, repository } = buildService();
    repository.findByIdPublic.mockResolvedValue({ id: 'oeuvre-1', statut: 'PUBLIEE' });

    const result = await service.getOeuvrePublic('oeuvre-1', select);
    expect(result.statut).toBe('PUBLIEE');
  });

  it('hides unpublished oeuvres from public detail via repository guard', async () => {
    const { service, repository } = buildService();
    repository.findByIdPublic.mockResolvedValue(null);

    await expect(service.getOeuvrePublic('oeuvre-brouillon', select)).rejects.toThrowError();
  });
});
