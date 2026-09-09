import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AdminArtisansRepository } from '../../src/modules/admin/artisans/admin-artisans.repository.js';

function createMockPrisma() {
  return {
    user: {
      findMany: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
    },
    oeuvre: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      groupBy: vi.fn().mockResolvedValue([]),
    },
    commandeArtisan: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
      groupBy: vi.fn().mockResolvedValue([]),
      aggregate: vi.fn().mockResolvedValue({
        _count: { _all: 0 },
        _sum: { montantTotal: null },
      }),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
  } as any;
}

describe(AdminArtisansRepository, () => {
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let repo: AdminArtisansRepository;

  beforeEach(() => {
    mockPrisma = createMockPrisma();
    repo = new AdminArtisansRepository(mockPrisma);
  });

  describe('listArtisans', () => {
    it('maps basic user profile correctly', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 'user-1',
          nom: 'Awa Diop',
          email: 'awa@test.com',
          telephone: '+221770000001',
          statut: 'ACTIF',
          createdAt: new Date('2025-01-01'),
          deletedAt: null,
          artisanProfile: {
            id: 'profile-1',
            nomAtelier: 'Atelier Awa',
            specialite: 'Poterie',
            localisation: 'Dakar',
            photoAtelierUrl: 'https://img.test/awa.jpg',
          },
        },
      ]);

      const result = await repo.listArtisans({ page: 1, limit: 10 });

      expect(result.total).toBe(0);
      expect(result.items).toHaveLength(1);
      expect(result.items[0]).toEqual({
        id: 'profile-1',
        userId: 'user-1',
        nom: 'Awa Diop',
        nomAtelier: 'Atelier Awa',
        avatar: 'https://img.test/awa.jpg',
        specialty: 'Poterie',
        location: 'Dakar',
        inscription: '2025-01-01T00:00:00.000Z',
        accountStatus: 'ACTIF',
        kycStatus: null,
        kycId: null,
        artworksCount: 0,
        grossOrderVolume: 0,
      });
    });

    it('merges artworksCount and grossOrderVolume correctly', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 'user-1',
          nom: 'Awa Diop',
          email: 'awa@test.com',
          telephone: '+221770000001',
          statut: 'ACTIF',
          createdAt: new Date('2025-01-01'),
          deletedAt: null,
          artisanProfile: {
            id: 'profile-1',
            nomAtelier: 'Atelier Awa',
            specialite: 'Poterie',
            localisation: 'Dakar',
            photoAtelierUrl: null,
          },
        },
        {
          id: 'user-2',
          nom: 'Moussa Ndiaye',
          email: null,
          telephone: '+221770000002',
          statut: 'INACTIF',
          createdAt: new Date('2025-02-01'),
          deletedAt: null,
          artisanProfile: {
            id: 'profile-2',
            nomAtelier: 'Atelier Moussa',
            specialite: 'Sculpture',
            localisation: 'Thiès',
            photoAtelierUrl: null,
          },
        },
      ]);
      mockPrisma.oeuvre.groupBy.mockResolvedValue([
        { artisanId: 'profile-1', _count: { _all: 3 } },
        { artisanId: 'profile-2', _count: { _all: 7 } },
      ]);
      mockPrisma.commandeArtisan.groupBy.mockResolvedValue([
        { artisanId: 'profile-1', _sum: { montantTotal: 150000 } },
        { artisanId: 'profile-2', _sum: { montantTotal: null } },
      ]);

      const result = await repo.listArtisans({ page: 1, limit: 10 });

      expect(result.items[0].artworksCount).toBe(3);
      expect(result.items[0].grossOrderVolume).toBe(150000);
      expect(result.items[1].artworksCount).toBe(7);
      expect(result.items[1].grossOrderVolume).toBe(0);
    });

    it('excludes ANNULEE and REMBOURSEE from grossOrderVolume in list', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 'user-1',
          nom: 'Awa Diop',
          email: null,
          telephone: '+221770000001',
          statut: 'ACTIF',
          createdAt: new Date('2025-01-01'),
          deletedAt: null,
          artisanProfile: {
            id: 'profile-1',
            nomAtelier: 'Atelier Awa',
            specialite: 'Poterie',
            localisation: 'Dakar',
            photoAtelierUrl: null,
          },
        },
      ]);
      mockPrisma.oeuvre.groupBy.mockResolvedValue([]);
      mockPrisma.commandeArtisan.groupBy.mockResolvedValue([]);

      await repo.listArtisans({ page: 1, limit: 10 });

      const groupByWhere = mockPrisma.commandeArtisan.groupBy.mock.calls[0][0].where;
      expect(groupByWhere.statut).toEqual({ notIn: ['ANNULEE', 'REMBOURSEE'] });
    });

    it('merges latest KYC status when available', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        {
          id: 'user-1',
          nom: 'Awa Diop',
          email: null,
          telephone: '+221770000001',
          statut: 'ACTIF',
          createdAt: new Date('2025-01-01'),
          deletedAt: null,
          artisanProfile: {
            id: 'profile-1',
            nomAtelier: 'Atelier Awa',
            specialite: 'Poterie',
            localisation: 'Dakar',
            photoAtelierUrl: null,
          },
        },
      ]);
      mockPrisma.$queryRaw.mockResolvedValue([
        { userId: 'user-1', kycId: 'kyc-abc', status: 'VALIDE', submittedAt: new Date(), reviewedAt: new Date() },
      ]);

      const result = await repo.listArtisans({ page: 1, limit: 10 });

      expect(result.items[0].kycStatus).toBe('VALIDE');
      expect(result.items[0].kycId).toBe('kyc-abc');
    });

    it('kycStatus filter passes correct SQL', async () => {
      await repo.listArtisans({ page: 1, limit: 10, kycStatus: 'REJETE' });

      // resolveArtisanUserIdsByStatut called → $queryRaw with status='REJETE'
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(mockPrisma.user.findMany).toHaveBeenCalledTimes(1);
      const where = mockPrisma.user.findMany.mock.calls[0][0].where;
      expect(where.id).toEqual({ in: [] }); // $queryRaw returned []
    });

    it('kycPending filter passes SOUMIS+EN_ATTENTE statuses', async () => {
      await repo.listArtisans({ page: 1, limit: 10, kycPending: true });

      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      // verify where includes id filter from the kyc subquery
      const where = mockPrisma.user.findMany.mock.calls[0][0].where;
      expect(where.id).toEqual({ in: [] });
    });

    it('accountStatus filter is applied to where clause', async () => {
      await repo.listArtisans({ page: 1, limit: 10, accountStatus: 'SUSPENDU' });

      const where = mockPrisma.user.findMany.mock.calls[0][0].where;
      expect(where.statut).toBe('SUSPENDU');
    });

    it('q filter applies OR conditions on user and artisanProfile fields', async () => {
      await repo.listArtisans({ page: 1, limit: 10, q: 'Dakar' });

      const where = mockPrisma.user.findMany.mock.calls[0][0].where;
      expect(where.OR).toEqual([
        { nom: { contains: 'Dakar', mode: 'insensitive' } },
        { email: { contains: 'Dakar', mode: 'insensitive' } },
        { telephone: { contains: 'Dakar' } },
        { artisanProfile: { nomAtelier: { contains: 'Dakar', mode: 'insensitive' } } },
        { artisanProfile: { specialite: { contains: 'Dakar', mode: 'insensitive' } } },
        { artisanProfile: { localisation: { contains: 'Dakar', mode: 'insensitive' } } },
      ]);
    });
  });

  describe('getArtisanStats', () => {
    it('aggregates artwork counts and order volume', async () => {
      mockPrisma.oeuvre.groupBy.mockResolvedValue([
        { statut: 'PUBLIEE', _count: { _all: 5 } },
        { statut: 'EN_PANIER', _count: { _all: 2 } },
        { statut: 'VENDUE', _count: { _all: 1 } },
        { statut: 'RETIREE', _count: { _all: 1 } },
      ]);
      mockPrisma.commandeArtisan.aggregate.mockResolvedValue({
        _count: { _all: 8 },
        _sum: { montantTotal: { valueOf: () => 350000 } },
      });

      const stats = await repo.getArtisanStats('profile-1');

      expect(stats).toEqual({
        totalOeuvres: 9,
        publiees: 5,
        enPanier: 2,
        vendues: 1,
        nbCommandesArtisan: 8,
        grossOrderVolume: 350000,
      });
    });

    it('returns zeros when no data', async () => {
      const stats = await repo.getArtisanStats('profile-empty');

      expect(stats.totalOeuvres).toBe(0);
      expect(stats.nbCommandesArtisan).toBe(0);
      expect(stats.grossOrderVolume).toBe(0);
    });

    it('excludes ANNULEE and REMBOURSEE from grossOrderVolume', async () => {
      mockPrisma.oeuvre.groupBy.mockResolvedValue([]);
      mockPrisma.commandeArtisan.aggregate.mockResolvedValue({
        _count: { _all: 3 },
        _sum: { montantTotal: { valueOf: () => 200000 } },
      });

      await repo.getArtisanStats('profile-1');

      const aggregateWhere = mockPrisma.commandeArtisan.aggregate.mock.calls[0][0].where;
      expect(aggregateWhere.statut).toEqual({ notIn: ['ANNULEE', 'REMBOURSEE'] });
    });
  });

  describe('listArtworks', () => {
    it('returns oeuvres with cover URL from first OEUVRE media', async () => {
      mockPrisma.oeuvre.count.mockResolvedValue(1);
      mockPrisma.oeuvre.findMany.mockResolvedValue([
        {
          id: 'oeuvre-1',
          titre: 'Vase Baoulé',
          statut: 'PUBLIEE',
          prixXOF: 45000,
          createdAt: new Date('2025-03-01'),
          medias: [{ id: 'media-1', url: 'https://img.test/vase.jpg', ordre: 0 }],
        },
      ]);

      const result = await repo.listArtworks('profile-1', { page: 1, limit: 10 });

      expect(result.items[0].coverUrl).toBe('https://img.test/vase.jpg');
      expect(result.items[0].prixXOF).toBe(45000);
      expect(result.total).toBe(1);
    });

    it('coverUrl is null when no OEUVRE media exists', async () => {
      mockPrisma.oeuvre.count.mockResolvedValue(1);
      mockPrisma.oeuvre.findMany.mockResolvedValue([
        {
          id: 'oeuvre-2',
          titre: 'Scène de marché',
          statut: 'BROUILLON',
          prixXOF: 30000,
          createdAt: new Date('2025-04-01'),
          medias: [],
        },
      ]);

      const result = await repo.listArtworks('profile-1', { page: 1, limit: 10 });
      expect(result.items[0].coverUrl).toBeNull();
    });
  });

  describe('listOrders', () => {
    it('normalizes Decimal to number and includes commande/acheteur without phone', async () => {
      mockPrisma.commandeArtisan.count.mockResolvedValue(1);
      mockPrisma.commandeArtisan.findMany.mockResolvedValue([
        {
          id: 'ca-1',
          statut: 'LIVREE',
          sousTotal: { valueOf: () => '120000' },
          commission: { valueOf: () => '12000' },
          fraisLivraison: { valueOf: () => '5000' },
          montantTotal: { valueOf: () => '137000' },
          createdAt: new Date('2025-05-01'),
          commande: {
            id: 'cmd-1',
            statut: 'LIVREE',
            dateCreation: new Date('2025-04-28'),
            createdAt: new Date('2025-04-28'),
            acheteur: {
              id: 'buyer-1',
              typeClient: 'PARTICULIER',
              user: { id: 'user-buyer-1', nom: 'Fatou Sow' },
            },
          },
        },
      ]);

      const result = await repo.listOrders('profile-1', { page: 1, limit: 10 });

      expect(result.items[0]).toEqual({
        id: 'ca-1',
        statut: 'LIVREE',
        sousTotal: 120000,
        commission: 12000,
        fraisLivraison: 5000,
        montantTotal: 137000,
        createdAt: new Date('2025-05-01'),
        commande: {
          id: 'cmd-1',
          statut: 'LIVREE',
          dateCreation: new Date('2025-04-28'),
          createdAt: new Date('2025-04-28'),
          acheteur: { id: 'buyer-1', typeClient: 'PARTICULIER', nom: 'Fatou Sow' },
        },
      });
    });
  });
});
