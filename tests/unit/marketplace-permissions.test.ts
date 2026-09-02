import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OeuvreService } from '../../src/modules/marketplace/oeuvre.service';
import { ForbiddenError, NotFoundError, ConflictError } from '../../src/common/errors/AppError';

function buildService(overrides = {}) {
  const repository = {
    findArtisanProfileById: vi.fn(),
    findArtisanProfileByUserId: vi.fn(),
    findCategorieById: vi.fn(),
    findById: vi.fn(),
    countMedias: vi.fn(),
    countLignesCommande: vi.fn(),
    invalidateCertificat: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    withdraw: vi.fn(),
    delete: vi.fn(),
    publish: vi.fn(),
    findAdminProfileByUserId: vi.fn(),
    ...overrides,
  } as any;
  return { service: new OeuvreService(repository), repository };
}

const validArtisanProfile = { id: 'artisan-1', user: { role: 'ARTISAN', statut: 'ACTIF' } };

describe('OeuvreService permissions & admin levels', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows create when artisan profile is valid', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileById.mockResolvedValue(validArtisanProfile);
    repository.findCategorieById.mockResolvedValue({ id: 'cat-1' });
    repository.create.mockResolvedValue({ id: 'oeuvre-1' });

    const result = await service.createOeuvre('artisan-1', {
      titre: 'T',
      description: 'D',
      technique: 'T',
      materiaux: 'M',
      dimensions: 'D',
      anneeCreation: 2023,
      prixXOF: 100,
      categorieId: 'cat-1',
    });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ artisanId: 'artisan-1', categorieId: 'cat-1' })
    );
    expect(result.id).toBe('oeuvre-1');
  });

  it('throws NotFoundError when artisan profile is missing', async () => {
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

  it('throws ForbiddenError when role is not ARTISAN', async () => {
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

  it('throws ForbiddenError when statut is not ACTIF', async () => {
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

  it('allows admin publish when profile is valid and oeuvre has media', async () => {
    const { service, repository } = buildService();
    repository.findAdminProfileByUserId.mockResolvedValue({ id: 'admin-profile-1' });
    repository.findById.mockResolvedValue({ id: 'oeuvre-1', statut: 'BROUILLON' });
    repository.countMedias.mockResolvedValue(1);
    repository.publish.mockResolvedValue({ statut: 'PUBLIEE' });

    const result = await service.publishOeuvre('admin-user-1', 'oeuvre-1');
    expect(repository.publish).toHaveBeenCalledWith('oeuvre-1', 'admin-profile-1');
    expect(result.statut).toBe('PUBLIEE');
  });

  it('publish rejects when admin profile is missing', async () => {
    const { service, repository } = buildService();
    repository.findAdminProfileByUserId.mockResolvedValue(null);

    await expect(service.publishOeuvre('admin-user', 'oeuvre-1')).rejects.toThrow(ForbiddenError);
    expect(repository.publish).not.toHaveBeenCalled();
  });

  it('publish rejects when statut is not eligible', async () => {
    const { service, repository } = buildService();
    repository.findAdminProfileByUserId.mockResolvedValue({ id: 'admin-profile-1' });
    repository.findById.mockResolvedValue({ id: 'oeuvre-1', statut: 'PUBLIEE' });

    await expect(service.publishOeuvre('admin-user', 'oeuvre-1')).rejects.toThrow(ConflictError);
    expect(repository.publish).not.toHaveBeenCalled();
  });

  it('publish rejects when no OEUVRE media', async () => {
    const { service, repository } = buildService();
    repository.findAdminProfileByUserId.mockResolvedValue({ id: 'admin-profile-1' });
    repository.findById.mockResolvedValue({ id: 'oeuvre-1', statut: 'BROUILLON' });
    repository.countMedias.mockResolvedValue(0);

    await expect(service.publishOeuvre('admin-user', 'oeuvre-1')).rejects.toThrow(ConflictError);
    expect(repository.publish).not.toHaveBeenCalled();
  });

  it('withdrawOeuvreAdmin requires statut PUBLIEE', async () => {
    const { service, repository } = buildService();
    repository.findById.mockResolvedValue({ id: 'oeuvre-1', statut: 'BROUILLON' });

    await expect(service.withdrawOeuvreAdmin('oeuvre-1')).rejects.toThrow(ConflictError);
  });

  it('withdrawOeuvreAdmin succeeds for PUBLIEE', async () => {
    const { service, repository } = buildService();
    repository.findById.mockResolvedValue({ id: 'oeuvre-1', statut: 'PUBLIEE' });
    repository.invalidateCertificat.mockResolvedValue(null);
    repository.withdraw.mockResolvedValue({ id: 'oeuvre-1', statut: 'RETIREE' });

    const result = await service.withdrawOeuvreAdmin('oeuvre-1');
    expect(result.statut).toBe('RETIREE');
    expect(repository.invalidateCertificat).toHaveBeenCalledWith('oeuvre-1');
  });

  it('throws NotFoundError for an unknown oeuvre in getMyOeuvre', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileByUserId.mockResolvedValue({ id: 'artisan-1' });
    repository.findById.mockResolvedValue(null);

    await expect(service.getMyOeuvre('user-1', 'oeuvre-x')).rejects.toThrow(NotFoundError);
  });

  it('forbids getMyOeuvre when oeuvre belongs to another artisan', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileByUserId.mockResolvedValue({ id: 'artisan-1' });
    repository.findById.mockResolvedValue({ id: 'oeuvre-1', statut: 'BROUILLON', artisanId: 'artisan-OTHER' });

    await expect(service.getMyOeuvre('user-1', 'oeuvre-1')).rejects.toThrow(ForbiddenError);
  });

  it('allows delete of a brouillon without ligne commande', async () => {
    const { service, repository } = buildService();
    repository.findById.mockResolvedValue({
      id: 'oeuvre-1',
      statut: 'BROUILLON',
      artisanId: 'artisan-1',
    });
    repository.countLignesCommande.mockResolvedValue(0);
    repository.delete.mockResolvedValue({ id: 'oeuvre-1' });

    await service.deleteOeuvre('oeuvre-1');
    expect(repository.delete).toHaveBeenCalledWith('oeuvre-1');
  });

  it('refuses delete when the oeuvre has ligne commandes', async () => {
    const { service, repository } = buildService();
    repository.findById.mockResolvedValue({
      id: 'oeuvre-1',
      statut: 'BROUILLON',
      artisanId: 'artisan-1',
    });
    repository.countLignesCommande.mockResolvedValue(2);

    await expect(service.deleteOeuvre('oeuvre-1')).rejects.toThrow(ConflictError);
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it('deleteOeuvre rejects non-BROUILLON status', async () => {
    const { service, repository } = buildService();
    repository.findById.mockResolvedValue({
      id: 'oeuvre-1',
      statut: 'PUBLIEE',
      artisanId: 'artisan-1',
    });

    await expect(service.deleteOeuvre('oeuvre-1')).rejects.toThrow(ConflictError);
    expect(repository.delete).not.toHaveBeenCalled();
  });
});
