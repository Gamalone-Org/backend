import { beforeEach, describe, expect, it, vi } from 'vitest';
import { adminKycListQuerySchema, ADMIN_KYC_STATUS_ALL } from '../../src/modules/kyc/kyc.schema.js';
import { KycRepository } from '../../src/modules/kyc/kyc.repository.js';
import { createKycServiceForTest, supportAdminActor } from './kyc-test-helpers.js';

function createPrismaMock() {
  return {
    kyc: {
      count: vi.fn().mockResolvedValue(0),
      findMany: vi.fn().mockResolvedValue([]),
    },
  };
}

function createRepositoryMock() {
  return {
    findPendingReviews: vi.fn(),
  };
}

describe('Admin KYC list — schéma de requête', () => {
  it('accepte le jeton ALL pour obtenir la liste complète', () => {
    const parsed = adminKycListQuerySchema.parse({ status: 'ALL' });
    expect(parsed.status).toBe(ADMIN_KYC_STATUS_ALL);
  });

  it.each(['BROUILLON', 'SOUMIS', 'EN_ATTENTE', 'VALIDE', 'REJETE', 'CORRECTION_REQUISE', 'EXPIRE'])(
    'accepte toujours le statut %s',
    (status) => {
      const parsed = adminKycListQuerySchema.parse({ status });
      expect(parsed.status).toBe(status);
    }
  );

  it('laisse status absent quand le paramètre n’est pas fourni (file de revue par défaut)', () => {
    const parsed = adminKycListQuerySchema.parse({});
    expect(parsed).toEqual({ page: 1, limit: 10 });
    expect('status' in parsed).toBe(false);
  });

  it('applique les valeurs de pagination par défaut et coerce les query strings', () => {
    expect(adminKycListQuerySchema.parse({})).toEqual({ page: 1, limit: 10 });
    expect(adminKycListQuerySchema.parse({ page: '3', limit: '50' })).toEqual({
      page: 3,
      limit: 50,
      status: undefined,
    });
  });

  it('combine status=ALL avec la pagination demandée', () => {
    const parsed = adminKycListQuerySchema.parse({ status: 'ALL', page: '2', limit: '100' });
    expect(parsed).toEqual({ page: 2, limit: 100, status: 'ALL' });
  });

  it('rejette un statut inconnu', () => {
    expect(() => adminKycListQuerySchema.parse({ status: 'INCONNU' })).toThrow();
    expect(() => adminKycListQuerySchema.parse({ status: 'TOUS' })).toThrow();
    expect(() => adminKycListQuerySchema.parse({ status: 'all' })).toThrow();
    expect(() => adminKycListQuerySchema.parse({ status: '' })).toThrow();
  });

  it('rejette une liste de statuts (le schéma reste scalaire)', () => {
    expect(() => adminKycListQuerySchema.parse({ status: 'SOUMIS,VALIDE' })).toThrow();
  });

  it('rejette les clés inconnues (schéma strict)', () => {
    expect(() => adminKycListQuerySchema.parse({ all: 'true' })).toThrow();
    expect(() => adminKycListQuerySchema.parse({ statut: 'ALL' })).toThrow();
  });

  it('refuse une pagination hors bornes', () => {
    expect(() => adminKycListQuerySchema.parse({ page: 0 })).toThrow();
    expect(() => adminKycListQuerySchema.parse({ limit: 101 })).toThrow();
  });
});

describe('KycRepository.findPendingReviews — construction du filtre', () => {
  let prisma: ReturnType<typeof createPrismaMock>;
  let repository: KycRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    prisma = createPrismaMock();
    prisma.kyc.count.mockResolvedValue(0);
    prisma.kyc.findMany.mockResolvedValue([]);
    repository = new KycRepository(prisma as any);
  });

  it('status=ALL ne filtre pas sur le statut (liste COMPLÈTE)', async () => {
    await repository.findPendingReviews({ page: 1, limit: 10, status: 'ALL' });

    expect(prisma.kyc.count).toHaveBeenCalledWith({ where: {} });
    expect(prisma.kyc.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: {}, skip: 0, take: 10 })
    );
  });

  it('applique le même where {} au count et au findMany pour la liste complète', async () => {
    prisma.kyc.count.mockResolvedValue(137);

    const result = await repository.findPendingReviews({ status: 'ALL' });

    const countArgs = prisma.kyc.count.mock.calls[0][0];
    const findArgs = prisma.kyc.findMany.mock.calls[0][0];
    expect(countArgs.where).toEqual(findArgs.where);
    expect(countArgs.where).toEqual({});
    expect(result.pagination.total).toBe(137);
  });

  it('conserve la file de revue SOUMIS + EN_ATTENTE quand status est absent', async () => {
    await repository.findPendingReviews({ page: 1, limit: 10 });

    expect(prisma.kyc.count).toHaveBeenCalledWith({
      where: { status: { in: ['SOUMIS', 'EN_ATTENTE'] } },
    });
    expect(prisma.kyc.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: { in: ['SOUMIS', 'EN_ATTENTE'] } } })
    );
  });

  it('conserve la file de revue quand la query est entièrement vide', async () => {
    await repository.findPendingReviews({});

    expect(prisma.kyc.count).toHaveBeenCalledWith({
      where: { status: { in: ['SOUMIS', 'EN_ATTENTE'] } },
    });
  });

  it.each(['BROUILLON', 'SOUMIS', 'EN_ATTENTE', 'VALIDE', 'REJETE', 'CORRECTION_REQUISE', 'EXPIRE'])(
    'filtre sur le statut unique %s quand il est fourni explicitement',
    async (status) => {
      await repository.findPendingReviews({ status: status as any });

      expect(prisma.kyc.count).toHaveBeenCalledWith({ where: { status } });
    }
  );

  it('conserve le tri et les relations pour la liste complète', async () => {
    await repository.findPendingReviews({ status: 'ALL' });

    const args = prisma.kyc.findMany.mock.calls[0][0];
    expect(args.orderBy).toEqual({ createdAt: 'desc' });
    expect(args.include.user.select).toMatchObject({
      id: true,
      telephone: true,
      email: true,
      role: true,
      statut: true,
      telephoneVerificationStatus: true,
    });
    expect(args.include.documents.select).toEqual({
      id: true,
      documentType: true,
      createdAt: true,
    });
  });

  it('pagine la liste complète via skip/take', async () => {
    await repository.findPendingReviews({ status: 'ALL', page: 3, limit: 25 });

    expect(prisma.kyc.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 50, take: 25 })
    );
  });

  it('retourne la pagination normalisée pour la liste complète', async () => {
    prisma.kyc.count.mockResolvedValue(0);

    const result = await repository.findPendingReviews({ status: 'ALL' });

    expect(result.pagination).toEqual({ page: 1, limit: 10, total: 0, totalPages: 1 });
  });
});

describe('KycService.listPendingReviews — transmission du filtre ALL', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('transmet status=ALL au repository sans le réécrire', async () => {
    const repository = createRepositoryMock();
    repository.findPendingReviews.mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
    });
    const service = createKycServiceForTest(repository);

    await service.listPendingReviews(supportAdminActor, { page: 1, limit: 10, status: 'ALL' });

    expect(repository.findPendingReviews).toHaveBeenCalledWith({
      page: 1,
      limit: 10,
      status: 'ALL',
    });
  });

  it('n’injecte aucun statut par défaut quand la query est vide', async () => {
    const repository = createRepositoryMock();
    repository.findPendingReviews.mockResolvedValue({
      data: [],
      pagination: { page: 1, limit: 10, total: 0, totalPages: 1 },
    });
    const service = createKycServiceForTest(repository);

    await service.listPendingReviews(supportAdminActor, {});

    expect(repository.findPendingReviews).toHaveBeenCalledWith({});
  });
});
