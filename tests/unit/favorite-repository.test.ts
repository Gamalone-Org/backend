import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FavoriteRepository } from '../../src/modules/favorites/favorites.repository.js';

const BUYER_PROFILE_ID = '123e4567-e89b-12d3-a456-426614174001';
const OTHER_BUYER_PROFILE_ID = '123e4567-e89b-12d3-a456-426614174002';
const OEUVRE_ID = '123e4567-e89b-12d3-a456-426614174100';

function buildRepository(overrides = {}) {
  const prisma = {
    buyerProfile: { findUnique: vi.fn() },
    oeuvre: { findFirst: vi.fn() },
    favori: {
      findMany: vi.fn(),
      count: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    ...overrides,
  } as any;
  const repository = new FavoriteRepository(prisma);
  return { repository, prisma };
}

describe('FavoriteRepository.findForAcheteur', () => {
  beforeEach(() => vi.clearAllMocks());

  it('F1 - scopes the query by the buyer profile id (acheteurId)', async () => {
    const { repository, prisma } = buildRepository();
    prisma.favori.findMany.mockResolvedValue([]);

    await repository.findForAcheteur(BUYER_PROFILE_ID, 1, 20);

    const call = prisma.favori.findMany.mock.calls[0][0];
    expect(call.where).toEqual({ acheteurId: BUYER_PROFILE_ID });
  });

  it('F2 - applies pagination skip/take', async () => {
    const { repository, prisma } = buildRepository();
    prisma.favori.findMany.mockResolvedValue([]);

    await repository.findForAcheteur(BUYER_PROFILE_ID, 3, 10);

    const call = prisma.favori.findMany.mock.calls[0][0];
    expect(call.skip).toBe((3 - 1) * 10);
    expect(call.take).toBe(10);
  });

  it('F3 - orders by dateCreation desc (most recent favorite first)', async () => {
    const { repository, prisma } = buildRepository();
    prisma.favori.findMany.mockResolvedValue([]);

    await repository.findForAcheteur(BUYER_PROFILE_ID, 1, 20);

    const call = prisma.favori.findMany.mock.calls[0][0];
    expect(call.orderBy).toEqual({ dateCreation: 'desc' });
  });

  it('F4 - count is scoped by acheteurId', async () => {
    const { repository, prisma } = buildRepository();
    prisma.favori.count.mockResolvedValue(3);

    const total = await repository.countForAcheteur(BUYER_PROFILE_ID);

    expect(total).toBe(3);
    expect(prisma.favori.count).toHaveBeenCalledWith({
      where: { acheteurId: BUYER_PROFILE_ID },
    });
  });

  it('F5 - selects the cover media (first OEUVRE media, ordre asc) and the artisan card only', async () => {
    const { repository, prisma } = buildRepository();
    prisma.favori.findMany.mockResolvedValue([]);

    await repository.findForAcheteur(BUYER_PROFILE_ID, 1, 20);

    const select = prisma.favori.findMany.mock.calls[0][0].select;
    expect(Object.keys(select).sort()).toEqual(['dateCreation', 'id', 'oeuvre']);
    expect(select.oeuvre.select.medias).toEqual({
      where: { type: 'OEUVRE' },
      orderBy: { ordre: 'asc' },
      take: 1,
      select: { id: true, url: true },
    });
    expect(select.oeuvre.select.artisan).toEqual({
      select: {
        id: true,
        nomAtelier: true,
        user: { select: { nom: true } },
      },
    });
  });

  it('F4 - the projection never exposes sensitive data', async () => {
    const { repository, prisma } = buildRepository();
    prisma.favori.findMany.mockResolvedValue([]);

    await repository.findForAcheteur(BUYER_PROFILE_ID, 1, 20);

    const serialized = JSON.stringify(prisma.favori.findMany.mock.calls[0][0]);
    for (const sensitive of [
      'email',
      'telephone',
      'motDePasse',
      'adresseLivraison',
      'motDePasse',
      'codeQR',
      'photoAtelierUrl',
      'photoProfilUrl',
    ]) {
      expect(serialized).not.toContain(sensitive);
    }
  });
});

describe('FavoriteRepository.upsertFavorite', () => {
  beforeEach(() => vi.clearAllMocks());

  it('F6 - creates the favorite via upsert on the unique (acheteurId, oeuvreId)', async () => {
    const { repository, prisma } = buildRepository();
    const favori = { id: 'f-1' };
    prisma.favori.upsert.mockResolvedValue(favori);

    const result = await repository.upsertFavorite(BUYER_PROFILE_ID, OEUVRE_ID);

    expect(result).toEqual(favori);
    expect(prisma.favori.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          acheteurId_oeuvreId: { acheteurId: BUYER_PROFILE_ID, oeuvreId: OEUVRE_ID },
        },
        update: {},
        create: { acheteurId: BUYER_PROFILE_ID, oeuvreId: OEUVRE_ID },
      })
    );
  });

  it('F6 - returns the existing favorite on a duplicate (idempotent upsert)', async () => {
    const { repository, prisma } = buildRepository();
    const existing = { id: 'f-dup', oeuvre: { id: OEUVRE_ID } };
    prisma.favori.upsert.mockResolvedValue(existing);

    const result = await repository.upsertFavorite(BUYER_PROFILE_ID, OEUVRE_ID);

    expect(result).toEqual(existing);
    expect(prisma.favori.upsert).toHaveBeenCalledTimes(1);
  });
});

describe('FavoriteRepository.deleteByAcheteurAndOeuvre', () => {
  beforeEach(() => vi.clearAllMocks());

  it('F7 - deletion is scoped with both acheteurId AND oeuvreId', async () => {
    const { repository, prisma } = buildRepository();
    prisma.favori.deleteMany.mockResolvedValue({ count: 1 });

    const result = await repository.deleteByAcheteurAndOeuvre(BUYER_PROFILE_ID, OEUVRE_ID);

    expect(result).toEqual({ count: 1 });
    expect(prisma.favori.deleteMany).toHaveBeenCalledWith({
      where: { acheteurId: BUYER_PROFILE_ID, oeuvreId: OEUVRE_ID },
    });
  });

  it('F8 - cannot implicitly target the favorite of another buyer', async () => {
    const { repository, prisma } = buildRepository();
    prisma.favori.deleteMany.mockResolvedValue({ count: 0 });

    // Acheteur B tente de supprimer oeuvre X : la requête doit combiner l'id
    // de B avec oeuvreId — le favori de l'acheteur A ne peut jamais être un
    // sous-ensemble de ce where.
    await repository.deleteByAcheteurAndOeuvre(OTHER_BUYER_PROFILE_ID, OEUVRE_ID);

    const where = prisma.favori.deleteMany.mock.calls[0][0].where;
    expect(where).toEqual({
      acheteurId: OTHER_BUYER_PROFILE_ID,
      oeuvreId: OEUVRE_ID,
    });
    // La suppression n'utilise jamais uniquement oeuvreId.
    expect(prisma.favori.deleteMany).not.toHaveBeenCalledWith({
      where: { oeuvreId: OEUVRE_ID },
    });
  });

  it('F7 - count 0 (absent favorite) is a success: deletion is idempotent', async () => {
    const { repository, prisma } = buildRepository();
    prisma.favori.deleteMany.mockResolvedValue({ count: 0 });

    const result = await repository.deleteByAcheteurAndOeuvre(BUYER_PROFILE_ID, OEUVRE_ID);

    expect(result).toEqual({ count: 0 });
  });
});

describe('FavoriteRepository.access', () => {
  beforeEach(() => vi.clearAllMocks());

  it('findBuyerProfileByUserId resolves the buyer by user id', async () => {
    const { repository, prisma } = buildRepository();
    prisma.buyerProfile.findUnique.mockResolvedValue({ id: BUYER_PROFILE_ID });

    const profile = await repository.findBuyerProfileByUserId('user-1');

    expect(profile).toEqual({ id: BUYER_PROFILE_ID });
    expect(prisma.buyerProfile.findUnique).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      select: { id: true },
    });
  });

  it('findAccessibleOeuvre only returns PUBLIEE oeuvres (catalog rule)', async () => {
    const { repository, prisma } = buildRepository();
    prisma.oeuvre.findFirst.mockResolvedValue(null);

    const oeuvre = await repository.findAccessibleOeuvre(OEUVRE_ID);

    expect(oeuvre).toBeNull();
    expect(prisma.oeuvre.findFirst).toHaveBeenCalledWith({
      where: { id: OEUVRE_ID, statut: 'PUBLIEE' },
      select: { id: true },
    });
  });
});