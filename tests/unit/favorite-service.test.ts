import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FavoriteService } from '../../src/modules/favorites/favorites.service.js';
import {
  ForbiddenError,
  NotFoundError,
} from '../../src/common/errors/AppError.js';

function buildService(overrides = {}) {
  const repository = {
    findBuyerProfileByUserId: vi.fn(),
    findAccessibleOeuvre: vi.fn(),
    findForAcheteur: vi.fn(),
    countForAcheteur: vi.fn(),
    upsertFavorite: vi.fn(),
    deleteByAcheteurAndOeuvre: vi.fn(),
    ...overrides,
  } as any;
  return { service: new FavoriteService(repository), repository };
}

const BUYER_PROFILE_ID = '123e4567-e89b-12d3-a456-426614174001';
const OEUVRE_ID = '123e4567-e89b-12d3-a456-426614174100';

describe('FavoriteService.getMyFavorites', () => {
  beforeEach(() => vi.clearAllMocks());

  it('F9 - throws ForbiddenError without a buyer profile and never calls the favorites queries', async () => {
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue(null);

    await expect(service.getMyFavorites('user-1', 1, 20)).rejects.toThrow(ForbiddenError);
    expect(repository.findForAcheteur).not.toHaveBeenCalled();
    expect(repository.countForAcheteur).not.toHaveBeenCalled();
  });

  it('F9 - resolves the buyer once then lists and counts scoped by buyer profile id', async () => {
    const { service, repository } = buildService();
    const favoris = [{ id: 'f-1', dateCreation: new Date() }];
    repository.findBuyerProfileByUserId.mockResolvedValue({ id: BUYER_PROFILE_ID });
    repository.findForAcheteur.mockResolvedValue(favoris);
    repository.countForAcheteur.mockResolvedValue(3);

    const result = await service.getMyFavorites('user-1', 2, 10);

    expect(repository.findBuyerProfileByUserId).toHaveBeenCalledWith('user-1');
    expect(repository.findForAcheteur).toHaveBeenCalledWith(BUYER_PROFILE_ID, 2, 10);
    expect(repository.countForAcheteur).toHaveBeenCalledWith(BUYER_PROFILE_ID);
    expect(result).toEqual({ favoris, total: 3, page: 2, limit: 10 });
  });
});

describe('FavoriteService.addFavorite', () => {
  beforeEach(() => vi.clearAllMocks());

  it('F9 - throws ForbiddenError without a buyer profile', async () => {
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue(null);

    await expect(service.addFavorite('user-1', OEUVRE_ID)).rejects.toThrow(ForbiddenError);
    expect(repository.findAccessibleOeuvre).not.toHaveBeenCalled();
    expect(repository.upsertFavorite).not.toHaveBeenCalled();
  });

  it('F10/F15 - throws NotFoundError when the artwork does not exist or is not accessible, no upsert', async () => {
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue({ id: BUYER_PROFILE_ID });
    repository.findAccessibleOeuvre.mockResolvedValue(null);

    await expect(service.addFavorite('user-1', OEUVRE_ID)).rejects.toThrow(NotFoundError);
    expect(repository.findAccessibleOeuvre).toHaveBeenCalledWith(OEUVRE_ID);
    expect(repository.upsertFavorite).not.toHaveBeenCalled();
  });

  it('F11 - adds a favorite scoped to the connected buyer', async () => {
    const { service, repository } = buildService();
    const favori = { id: 'f-1', dateCreation: new Date(), oeuvre: { id: OEUVRE_ID } };
    repository.findBuyerProfileByUserId.mockResolvedValue({ id: BUYER_PROFILE_ID });
    repository.findAccessibleOeuvre.mockResolvedValue({ id: OEUVRE_ID });
    repository.upsertFavorite.mockResolvedValue(favori);

    const result = await service.addFavorite('user-1', OEUVRE_ID);

    expect(repository.upsertFavorite).toHaveBeenCalledWith(BUYER_PROFILE_ID, OEUVRE_ID);
    expect(result).toEqual(favori);
  });

  it('F12 - duplicate add returns the existing favorite (idempotent, no 500)', async () => {
    const { service, repository } = buildService();
    const existing = { id: 'f-dup', dateCreation: new Date(), oeuvre: { id: OEUVRE_ID } };
    repository.findBuyerProfileByUserId.mockResolvedValue({ id: BUYER_PROFILE_ID });
    repository.findAccessibleOeuvre.mockResolvedValue({ id: OEUVRE_ID });
    // L'upsert retourne le favori existant, jamais une exception de contrainte.
    repository.upsertFavorite.mockResolvedValue(existing);

    const first = await service.addFavorite('user-1', OEUVRE_ID);
    const second = await service.addFavorite('user-1', OEUVRE_ID);

    expect(first.id).toBe('f-dup');
    expect(second.id).toBe('f-dup');
    expect(repository.upsertFavorite).toHaveBeenCalledTimes(2);
  });
});

describe('FavoriteService.removeFavorite', () => {
  beforeEach(() => vi.clearAllMocks());

  it('F9 - throws ForbiddenError without a buyer profile and never deletes', async () => {
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue(null);

    await expect(service.removeFavorite('user-1', OEUVRE_ID)).rejects.toThrow(ForbiddenError);
    expect(repository.deleteByAcheteurAndOeuvre).not.toHaveBeenCalled();
  });

  it('F13 - removes the favorite scoped by the connected buyer profile id', async () => {
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue({ id: BUYER_PROFILE_ID });
    repository.deleteByAcheteurAndOeuvre.mockResolvedValue({ count: 1 });

    await service.removeFavorite('user-1', OEUVRE_ID);

    expect(repository.deleteByAcheteurAndOeuvre).toHaveBeenCalledWith(
      BUYER_PROFILE_ID,
      OEUVRE_ID
    );
  });

  it('F14 - removing an absent favorite is idempotent (no error)', async () => {
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue({ id: BUYER_PROFILE_ID });
    repository.deleteByAcheteurAndOeuvre.mockResolvedValue({ count: 0 });

    await expect(service.removeFavorite('user-1', OEUVRE_ID)).resolves.toBeUndefined();
  });
});