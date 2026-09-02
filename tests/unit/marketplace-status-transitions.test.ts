import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OeuvreService } from '../../src/modules/marketplace/oeuvre.service';
import {
  NotFoundError,
  ConflictError,
} from '../../src/common/errors/AppError';
import { VALID_STATUS_TRANSITIONS } from '../../src/modules/marketplace/types';

function buildOeuvre(overrides: Partial<any> = {}) {
  return {
    id: 'oeuvre-1',
    titre: 'Test',
    statut: 'BROUILLON',
    artisanId: 'artisan-1',
    ...overrides,
  };
}

function buildService(overrides = {}) {
  const repository = {
    findArtisanProfileById: vi.fn(),
    findArtisanProfileByUserId: vi.fn(),
    findCategorieById: vi.fn(),
    findById: vi.fn(),
    findByIdPublic: vi.fn(),
    countMedias: vi.fn(),
    countLignesCommande: vi.fn(),
    invalidateCertificat: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    updateStatut: vi.fn(),
    withdraw: vi.fn(),
    delete: vi.fn(),
    publish: vi.fn(),
    findPublishedPublic: vi.fn(),
    findFeatured: vi.fn(),
    findPublishedByArtisan: vi.fn(),
    findAllAdmin: vi.fn(),
    findByArtisanId: vi.fn(),
    findAdminProfileByUserId: vi.fn(),
    findMediaById: vi.fn(),
    getMediasByOeuvreId: vi.fn(),
    reorderMedias: vi.fn(),
    ...overrides,
  } as any;
  return { service: new OeuvreService(repository), repository };
}

describe('OeuvreService status transitions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('allows BROUILLON -> PUBLIEE via publish', async () => {
    const { service, repository } = buildService();
    repository.findAdminProfileByUserId.mockResolvedValue({ id: 'admin-profile-1' });
    repository.findById.mockResolvedValue(buildOeuvre({ statut: 'BROUILLON' }));
    repository.countMedias.mockResolvedValue(1);
    repository.publish.mockResolvedValue(buildOeuvre({ statut: 'PUBLIEE' }));

    const result = await service.publishOeuvre('admin-user-1', 'oeuvre-1');
    expect(result.statut).toBe('PUBLIEE');
    expect(repository.publish).toHaveBeenCalledWith('oeuvre-1', 'admin-profile-1');
  });

  it('allows EN_ATTENTE_VALIDATION -> PUBLIEE via publish', async () => {
    const { service, repository } = buildService();
    repository.findAdminProfileByUserId.mockResolvedValue({ id: 'admin-profile-1' });
    repository.findById.mockResolvedValue(buildOeuvre({ statut: 'EN_ATTENTE_VALIDATION' }));
    repository.countMedias.mockResolvedValue(1);
    repository.publish.mockResolvedValue(buildOeuvre({ statut: 'PUBLIEE' }));

    const result = await service.publishOeuvre('admin-user-1', 'oeuvre-1');
    expect(result.statut).toBe('PUBLIEE');
  });

  it('rejects publish when the oeuvre is not eligible', async () => {
    const { service, repository } = buildService();
    repository.findAdminProfileByUserId.mockResolvedValue({ id: 'admin-profile-1' });
    repository.findById.mockResolvedValue(buildOeuvre({ statut: 'PUBLIEE' }));

    await expect(service.publishOeuvre('admin-user-1', 'oeuvre-1')).rejects.toThrow(ConflictError);
    expect(repository.publish).not.toHaveBeenCalled();
  });

  it('rejects publish when no OEUVRE media attached', async () => {
    const { service, repository } = buildService();
    repository.findAdminProfileByUserId.mockResolvedValue({ id: 'admin-profile-1' });
    repository.findById.mockResolvedValue(buildOeuvre({ statut: 'BROUILLON' }));
    repository.countMedias.mockResolvedValue(0);

    await expect(service.publishOeuvre('admin-user-1', 'oeuvre-1')).rejects.toThrow(ConflictError);
    expect(repository.publish).not.toHaveBeenCalled();
  });

  it('allows PUBLIEE -> RETIREE via admin withdraw', async () => {
    const { service, repository } = buildService();
    repository.findById.mockResolvedValue(buildOeuvre({ statut: 'PUBLIEE' }));
    repository.invalidateCertificat.mockResolvedValue(null);
    repository.withdraw.mockResolvedValue(buildOeuvre({ statut: 'RETIREE' }));

    const result = await service.withdrawOeuvreAdmin('oeuvre-1');
    expect(result.statut).toBe('RETIREE');
    expect(repository.invalidateCertificat).toHaveBeenCalledWith('oeuvre-1');
  });

  it('rejects admin withdraw of a non-published oeuvre', async () => {
    const { service, repository } = buildService();
    repository.findById.mockResolvedValue(buildOeuvre({ statut: 'BROUILLON' }));

    await expect(service.withdrawOeuvreAdmin('oeuvre-1')).rejects.toThrow(ConflictError);
  });

  it('validates transition map is coherent', () => {
    expect(VALID_STATUS_TRANSITIONS.BROUILLON).toContain('EN_ATTENTE_VALIDATION');
    expect(VALID_STATUS_TRANSITIONS['EN_ATTENTE_VALIDATION']).toContain('PUBLIEE');
    expect(VALID_STATUS_TRANSITIONS['EN_ATTENTE_VALIDATION']).toContain('BROUILLON');
    expect(VALID_STATUS_TRANSITIONS.PUBLIEE).toContain('RETIREE');
    expect(VALID_STATUS_TRANSITIONS.PUBLIEE).toContain('VENDUE');
    expect(VALID_STATUS_TRANSITIONS.VENDUE).toEqual([]);
    expect(VALID_STATUS_TRANSITIONS.RETIREE).toEqual([]);
  });
});
