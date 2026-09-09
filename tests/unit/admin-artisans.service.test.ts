import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminArtisansService } from '../../src/modules/admin/artisans/admin-artisans.service.js';
import { ForbiddenError, NotFoundError } from '../../src/common/errors/AppError.js';
import type { AdminArtisansRepository } from '../../src/modules/admin/artisans/admin-artisans.repository.js';

const SUPPORT_ACTOR = {
  id: 'admin-1',
  role: 'ADMIN',
  adminAccessLevel: 'SUPPORT' as const,
};

const MODERATEUR_ACTOR = {
  id: 'admin-1',
  role: 'ADMIN',
  adminAccessLevel: 'MODERATEUR' as const,
};

const BUYER_ACTOR = {
  id: 'buyer-1',
  role: 'ACHETEUR',
  adminAccessLevel: null,
};

function createMockRepo(): AdminArtisansRepository {
  return {
    listArtisans: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 10 }),
    findArtisanDetail: vi.fn().mockResolvedValue(null),
    getArtisanStats: vi.fn().mockResolvedValue({
      totalOeuvres: 0,
      publiees: 0,
      enPanier: 0,
      vendues: 0,
      nbCommandesArtisan: 0,
      grossOrderVolume: 0,
    }),
    latestKycByUserIds: vi.fn().mockResolvedValue([]),
    countArtworksByArtisan: vi.fn().mockResolvedValue(0),
    listArtworks: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 10 }),
    listOrders: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, limit: 10 }),
  } as unknown as AdminArtisansRepository;
}

describe(AdminArtisansService, () => {
  let mockRepo: AdminArtisansRepository;
  let service: AdminArtisansService;

  beforeEach(() => {
    mockRepo = createMockRepo();
    service = new AdminArtisansService(mockRepo);
  });

  describe('access control', () => {
    it('listArtisans throws ForbiddenError for non-admin actor', async () => {
      await expect(service.listArtisans(BUYER_ACTOR, { page: 1, limit: 10 })).rejects.toThrow(
        ForbiddenError
      );
    });

    it('getArtisanDetail throws ForbiddenError for non-admin actor', async () => {
      await expect(service.getArtisanDetail(BUYER_ACTOR, 'fake-id')).rejects.toThrow(ForbiddenError);
    });

    it('listArtworks throws ForbiddenError for non-admin actor', async () => {
      await expect(service.listArtworks(BUYER_ACTOR, 'fake-id', { page: 1, limit: 10 })).rejects.toThrow(
        ForbiddenError
      );
    });

    it('listOrders throws ForbiddenError for non-admin actor', async () => {
      await expect(service.listOrders(BUYER_ACTOR, 'fake-id', { page: 1, limit: 10 })).rejects.toThrow(
        ForbiddenError
      );
    });

    it('allows SUPPORT actor for all read endpoints', async () => {
      (mockRepo.findArtisanDetail as any).mockResolvedValue({
        id: 'profile-1',
        type: 'ARTISAN',
        nomAtelier: 'Atelier',
        specialite: 'Poterie',
        biographie: 'Bio',
        localisation: 'Dakar',
        anneesExperience: 5,
        estCertifie: false,
        scoreFiabilite: null,
        photoAtelierUrl: null,
        validatedAt: null,
        createdAt: new Date('2025-01-01'),
        user: {
          id: 'user-1',
          nom: 'Awa',
          email: null,
          telephone: '+221770000001',
          statut: 'ACTIF',
          role: 'ARTISAN',
          deletedAt: null,
          createdAt: new Date('2025-01-01'),
        },
      });
      (mockRepo.latestKycByUserIds as any).mockResolvedValue([]);
      (mockRepo.getArtisanStats as any).mockResolvedValue({
        totalOeuvres: 0,
        publiees: 0,
        enPanier: 0,
        vendues: 0,
        nbCommandesArtisan: 0,
        grossOrderVolume: 0,
      });

      await expect(service.listArtisans(SUPPORT_ACTOR, { page: 1, limit: 10 })).resolves.toBeDefined();
      await expect(service.getArtisanDetail(SUPPORT_ACTOR, 'profile-1')).resolves.toBeDefined();
      await expect(service.listArtworks(SUPPORT_ACTOR, 'profile-1', { page: 1, limit: 10 })).resolves.toBeDefined();
      await expect(service.listOrders(SUPPORT_ACTOR, 'profile-1', { page: 1, limit: 10 })).resolves.toBeDefined();
    });

    it('allows MODERATEUR actor for all read endpoints', async () => {
      await expect(service.listArtisans(MODERATEUR_ACTOR, { page: 1, limit: 10 })).resolves.toBeDefined();
    });
  });

  describe('getArtisanDetail', () => {
    it('throws NotFoundError when artisan profile does not exist', async () => {
      (mockRepo.findArtisanDetail as any).mockResolvedValue(null);

      await expect(service.getArtisanDetail(SUPPORT_ACTOR, 'missing-id')).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when associated user is deleted', async () => {
      (mockRepo.findArtisanDetail as any).mockResolvedValue({
        id: 'profile-1',
        type: 'ARTISAN',
        nomAtelier: 'Atelier',
        specialite: 'Poterie',
        biographie: 'Bio',
        localisation: 'Dakar',
        anneesExperience: 5,
        estCertifie: false,
        scoreFiabilite: null,
        photoAtelierUrl: null,
        validatedAt: null,
        createdAt: new Date('2025-01-01'),
        user: {
          id: 'user-1',
          nom: 'Awa',
          email: null,
          telephone: '+221770000001',
          statut: 'ACTIF',
          role: 'ARTISAN',
          deletedAt: new Date('2025-06-01'),
          createdAt: new Date('2025-01-01'),
        },
      });

      await expect(service.getArtisanDetail(SUPPORT_ACTOR, 'profile-1')).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError when user role is not ARTISAN', async () => {
      (mockRepo.findArtisanDetail as any).mockResolvedValue({
        id: 'profile-1',
        type: 'ARTISAN',
        nomAtelier: 'Atelier',
        specialite: 'Poterie',
        biographie: 'Bio',
        localisation: 'Dakar',
        anneesExperience: 5,
        estCertifie: false,
        scoreFiabilite: null,
        photoAtelierUrl: null,
        validatedAt: null,
        createdAt: new Date('2025-01-01'),
        user: {
          id: 'user-1',
          nom: 'Admin',
          email: null,
          telephone: '+221770000001',
          statut: 'ACTIF',
          role: 'ADMIN',
          deletedAt: null,
          createdAt: new Date('2025-01-01'),
        },
      });

      await expect(service.getArtisanDetail(SUPPORT_ACTOR, 'profile-1')).rejects.toThrow(NotFoundError);
    });

    it('returns assembled detail with stats and KYC summary', async () => {
      (mockRepo.findArtisanDetail as any).mockResolvedValue({
        id: 'profile-1',
        type: 'ARTISAN',
        nomAtelier: 'Atelier Awa',
        specialite: 'Poterie',
        biographie: 'Bio',
        localisation: 'Dakar',
        anneesExperience: 5,
        estCertifie: false,
        scoreFiabilite: { toNumber: () => 4.5 },
        photoAtelierUrl: 'https://img.test/awa.jpg',
        validatedAt: new Date('2025-02-01'),
        createdAt: new Date('2025-01-01'),
        user: {
          id: 'user-1',
          nom: 'Awa Diop',
          email: 'awa@test.com',
          telephone: '+221770000001',
          statut: 'ACTIF',
          role: 'ARTISAN',
          deletedAt: null,
          createdAt: new Date('2025-01-01'),
        },
      });
      (mockRepo.latestKycByUserIds as any).mockResolvedValue([
        { userId: 'user-1', kycId: 'kyc-abc', status: 'VALIDE', submittedAt: new Date('2025-02-01'), reviewedAt: new Date('2025-02-05') },
      ]);
      (mockRepo.getArtisanStats as any).mockResolvedValue({
        totalOeuvres: 5,
        publiees: 3,
        enPanier: 1,
        vendues: 1,
        nbCommandesArtisan: 12,
        grossOrderVolume: 480000,
      });

      const result = await service.getArtisanDetail(SUPPORT_ACTOR, 'profile-1');

      expect(result.profil.userId).toBe('user-1');
      expect(result.profil.accountStatus).toBe('ACTIF');
      expect(result.artisan.nomAtelier).toBe('Atelier Awa');
      expect(result.artisan.scoreFiabilite).toBe(4.5);
      expect(result.kyc).toEqual({
        id: 'kyc-abc',
        status: 'VALIDE',
        submittedAt: new Date('2025-02-01'),
        reviewedAt: new Date('2025-02-05'),
      });
      expect(result.statistiques.nbCommandesArtisan).toBe(12);
      expect(result.statistiques.grossOrderVolume).toBe(480000);
    });
  });

  describe('listArtworks / listOrders', () => {
    it('listArtworks throws NotFoundError when artisan not found', async () => {
      (mockRepo.findArtisanDetail as any).mockResolvedValue(null);
      await expect(service.listArtworks(SUPPORT_ACTOR, 'missing', { page: 1, limit: 10 })).rejects.toThrow(
        NotFoundError
      );
    });

    it('listOrders throws NotFoundError when artisan not found', async () => {
      (mockRepo.findArtisanDetail as any).mockResolvedValue(null);
      await expect(service.listOrders(SUPPORT_ACTOR, 'missing', { page: 1, limit: 10 })).rejects.toThrow(
        NotFoundError
      );
    });

    it('listArtworks delegates to repository with correct parameters', async () => {
      (mockRepo.findArtisanDetail as any).mockResolvedValue({
        id: 'profile-1',
        type: 'ARTISAN',
        nomAtelier: 'Atelier',
        specialite: 'Poterie',
        biographie: 'Bio',
        localisation: 'Dakar',
        anneesExperience: 5,
        estCertifie: false,
        scoreFiabilite: null,
        photoAtelierUrl: null,
        validatedAt: null,
        createdAt: new Date('2025-01-01'),
        user: { id: 'user-1', nom: 'Awa', email: null, telephone: '+221770000001', statut: 'ACTIF', role: 'ARTISAN', deletedAt: null, createdAt: new Date('2025-01-01') },
      });

      await service.listArtworks(SUPPORT_ACTOR, 'profile-1', { page: 2, limit: 5, statut: 'PUBLIEE' });

      expect(mockRepo.listArtworks).toHaveBeenCalledWith('profile-1', {
        page: 2,
        limit: 5,
        statut: 'PUBLIEE',
      });
    });
  });
});
