import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ArtisanProfileService } from '../../src/modules/artisan-profile/artisan-profile.service.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../src/common/errors/AppError.js';

const ARTISAN_PROFILE_ID = '123e4567-e89b-12d3-a456-426614174111';
const USER_ID = '123e4567-e89b-12d3-a456-426614174000';

function buildService(overrides = {}) {
  const repository = {
    findArtisanProfileByUserId: vi.fn(),
    findFullProfile: vi.fn(),
    updateProfil: vi.fn(),
    uploadPhotoProfil: vi.fn(),
    deletePhotoProfil: vi.fn(),
    uploadBanniere: vi.fn(),
    deleteBanniere: vi.fn(),
    getAtelierPhotos: vi.fn(),
    countAtelierPhotos: vi.fn(),
    uploadAtelierPhoto: vi.fn(),
    findAtelierPhotoById: vi.fn(),
    deleteAtelierPhoto: vi.fn(),
    reorderAtelierPhotos: vi.fn(),
    getProcessusEtapes: vi.fn(),
    countProcessusEtapes: vi.fn(),
    createProcessusEtape: vi.fn(),
    findProcessusEtapeById: vi.fn(),
    updateProcessusEtape: vi.fn(),
    deleteProcessusEtape: vi.fn(),
    uploadProcessusPhoto: vi.fn(),
    reorderProcessus: vi.fn(),
    getExpositions: vi.fn(),
    createExposition: vi.fn(),
    findExpositionById: vi.fn(),
    updateExposition: vi.fn(),
    deleteExposition: vi.fn(),
    upsertPaymentPreference: vi.fn(),
    ...overrides,
  } as any;
  return {
    service: new ArtisanProfileService(repository),
    repository,
  };
}

const IMAGE_OPTIONS = { domain: 'artworks' as const, mimeType: 'image/jpeg', bytes: 1024 };

describe('ArtisanProfileService — profil principal', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns the full profile for the owner', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileByUserId.mockResolvedValue({ id: ARTISAN_PROFILE_ID });
    const fullProfile = { id: ARTISAN_PROFILE_ID, user: { id: USER_ID } };
    repository.findFullProfile.mockResolvedValue(fullProfile);

    const result = await service.getMyProfile(USER_ID);

    expect(repository.findArtisanProfileByUserId).toHaveBeenCalledWith(USER_ID);
    expect(repository.findFullProfile).toHaveBeenCalledWith(ARTISAN_PROFILE_ID);
    expect(result).toBe(fullProfile);
  });

  it('rejects a user without an artisan profile (ForbiddenError)', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileByUserId.mockResolvedValue(null);

    await expect(service.getMyProfile(USER_ID)).rejects.toThrow(ForbiddenError);
    expect(repository.findFullProfile).not.toHaveBeenCalled();
  });

  it('404 when the full profile cannot be resolved', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileByUserId.mockResolvedValue({ id: ARTISAN_PROFILE_ID });
    repository.findFullProfile.mockResolvedValue(null);

    await expect(service.getMyProfile(USER_ID)).rejects.toThrow(NotFoundError);
  });

  it('merges social links with existing profile links on update', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileByUserId.mockResolvedValue({ id: ARTISAN_PROFILE_ID });
    repository.findFullProfile.mockResolvedValue({
      id: ARTISAN_PROFILE_ID,
      liensReseauxSociaux: { facebook: 'https://facebook.com/ancien' },
      preparationMinDays: 1,
      preparationMaxDays: 3,
    });
    repository.updateProfil.mockResolvedValue({ id: ARTISAN_PROFILE_ID });

    await service.updateMyProfile(USER_ID, { instagram: 'https://instagram.com/adj', nomAtelier: 'Atelier Adjévi' });

    expect(repository.updateProfil).toHaveBeenCalledWith(ARTISAN_PROFILE_ID, {
      nomAtelier: 'Atelier Adjévi',
      liensReseauxSociaux: {
        facebook: 'https://facebook.com/ancien',
        instagram: 'https://instagram.com/adj',
      },
    });
  });

  it('rejects preparationMinDays > preparationMaxDays', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileByUserId.mockResolvedValue({ id: ARTISAN_PROFILE_ID });
    repository.findFullProfile.mockResolvedValue({ id: ARTISAN_PROFILE_ID });

    await expect(
      service.updateMyProfile(USER_ID, { preparationMinDays: 5, preparationMaxDays: 2 })
    ).rejects.toThrow(ValidationError);
  });

  it('rejects a non-image MIME type for the photo de profil', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileByUserId.mockResolvedValue({ id: ARTISAN_PROFILE_ID });

    await expect(
      service.uploadPhotoProfil(USER_ID, Buffer.from('x'), {
        domain: 'artworks',
        mimeType: 'application/pdf',
        bytes: 10,
      })
    ).rejects.toThrow(ValidationError);
    expect(repository.uploadPhotoProfil).not.toHaveBeenCalled();
  });

  it('delete photo profil 404 when no image is set', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileByUserId.mockResolvedValue({ id: ARTISAN_PROFILE_ID });
    repository.findFullProfile.mockResolvedValue({ id: ARTISAN_PROFILE_ID });

    await expect(service.deletePhotoProfil(USER_ID)).rejects.toThrow(NotFoundError);
  });
});

describe('ArtisanProfileService — photos atelier', () => {
  beforeEach(() => vi.clearAllMocks());

  it('enforces the maximum of 3 photos', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileByUserId.mockResolvedValue({ id: ARTISAN_PROFILE_ID });
    repository.countAtelierPhotos.mockResolvedValue(3);

    await expect(
      service.uploadAtelierPhoto(USER_ID, Buffer.from('x'), IMAGE_OPTIONS)
    ).rejects.toThrow(ConflictError);
    expect(repository.uploadAtelierPhoto).not.toHaveBeenCalled();
  });

  it('uploads a photo when under the limit', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileByUserId.mockResolvedValue({ id: ARTISAN_PROFILE_ID });
    repository.countAtelierPhotos.mockResolvedValue(1);
    repository.uploadAtelierPhoto.mockResolvedValue({ id: 'photo-1', ordre: 1 });

    const result = await service.uploadAtelierPhoto(USER_ID, Buffer.from('x'), IMAGE_OPTIONS);

    expect(repository.uploadAtelierPhoto).toHaveBeenCalled();
    expect(result.id).toBe('photo-1');
  });

  it('rejects deletion of a photo belonging to another artisan (404)', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileByUserId.mockResolvedValue({ id: ARTISAN_PROFILE_ID });
    repository.findAtelierPhotoById.mockResolvedValue({ id: 'photo-9', artisanId: 'AUTRE-ARTISAN' });

    await expect(service.deleteAtelierPhoto(USER_ID, 'photo-9')).rejects.toThrow(NotFoundError);
    expect(repository.deleteAtelierPhoto).not.toHaveBeenCalled();
  });

  it('deletes an owned photo', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileByUserId.mockResolvedValue({ id: ARTISAN_PROFILE_ID });
    repository.findAtelierPhotoById.mockResolvedValue({ id: 'photo-1', artisanId: ARTISAN_PROFILE_ID });
    repository.deleteAtelierPhoto.mockResolvedValue({ id: 'photo-1' });

    await service.deleteAtelierPhoto(USER_ID, 'photo-1');

    expect(repository.deleteAtelierPhoto).toHaveBeenCalledWith('photo-1');
  });

  it('rejects reorder that includes a foreign photo', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileByUserId.mockResolvedValue({ id: ARTISAN_PROFILE_ID });
    repository.getAtelierPhotos.mockResolvedValue([{ id: 'photo-1' }, { id: 'photo-2' }]);

    await expect(
      service.reorderAtelierPhotos(USER_ID, ['photo-1', 'photo-99'])
    ).rejects.toThrow(NotFoundError);
  });

  it('rejects reorder with duplicates', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileByUserId.mockResolvedValue({ id: ARTISAN_PROFILE_ID });
    repository.getAtelierPhotos.mockResolvedValue([{ id: 'photo-1' }, { id: 'photo-2' }]);

    await expect(
      service.reorderAtelierPhotos(USER_ID, ['photo-1', 'photo-1'])
    ).rejects.toThrow(ValidationError);
  });

  it('applies the new order', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileByUserId.mockResolvedValue({ id: ARTISAN_PROFILE_ID });
    repository.getAtelierPhotos.mockResolvedValue([{ id: 'photo-1' }, { id: 'photo-2' }]);
    repository.reorderAtelierPhotos.mockResolvedValue([{}, {}]);

    await service.reorderAtelierPhotos(USER_ID, ['photo-2', 'photo-1']);

    expect(repository.reorderAtelierPhotos).toHaveBeenCalledWith(ARTISAN_PROFILE_ID, [
      'photo-2',
      'photo-1',
    ]);
  });
});

describe('ArtisanProfileService — processus de création', () => {
  beforeEach(() => vi.clearAllMocks());

  it('enforces the maximum of 4 étapes', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileByUserId.mockResolvedValue({ id: ARTISAN_PROFILE_ID });
    repository.countProcessusEtapes.mockResolvedValue(4);

    await expect(
      service.createProcessusEtape(USER_ID, { ordre: 5, legende: 'Nouvelle étape' })
    ).rejects.toThrow(ConflictError);
    expect(repository.createProcessusEtape).not.toHaveBeenCalled();
  });

  it('rejects a duplicate ordre', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileByUserId.mockResolvedValue({ id: ARTISAN_PROFILE_ID });
    repository.countProcessusEtapes.mockResolvedValue(1);
    repository.getProcessusEtapes.mockResolvedValue([{ id: 'etape-1', ordre: 1 }]);

    await expect(
      service.createProcessusEtape(USER_ID, { ordre: 1, legende: 'Etape' })
    ).rejects.toThrow(ConflictError);
  });

  it('creates a new étape', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileByUserId.mockResolvedValue({ id: ARTISAN_PROFILE_ID });
    repository.countProcessusEtapes.mockResolvedValue(0);
    repository.getProcessusEtapes.mockResolvedValue([]);
    repository.createProcessusEtape.mockResolvedValue({ id: 'etape-1', ordre: 1, legende: 'Photo' });

    const result = await service.createProcessusEtape(USER_ID, { ordre: 1, legende: 'Photo' });

    expect(repository.createProcessusEtape).toHaveBeenCalledWith(ARTISAN_PROFILE_ID, {
      ordre: 1,
      legende: 'Photo',
    });
    expect(result.id).toBe('etape-1');
  });

  it('404 updating an étape of another artisan', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileByUserId.mockResolvedValue({ id: ARTISAN_PROFILE_ID });
    repository.findProcessusEtapeById.mockResolvedValue({ id: 'etape-9', artisanId: 'AUTRE' });

    await expect(
      service.updateProcessusEtape(USER_ID, 'etape-9', { legende: 'X' })
    ).rejects.toThrow(NotFoundError);
  });

  it('404 deleting an étape of another artisan', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileByUserId.mockResolvedValue({ id: ARTISAN_PROFILE_ID });
    repository.findProcessusEtapeById.mockResolvedValue({ id: 'etape-9', artisanId: 'AUTRE' });

    await expect(service.deleteProcessusEtape(USER_ID, 'etape-9')).rejects.toThrow(NotFoundError);
    expect(repository.deleteProcessusEtape).not.toHaveBeenCalled();
  });

  it('rejects photo upload on an étape of another artisan', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileByUserId.mockResolvedValue({ id: ARTISAN_PROFILE_ID });
    repository.findProcessusEtapeById.mockResolvedValue({ id: 'etape-9', artisanId: 'AUTRE' });

    await expect(
      service.uploadProcessusPhoto(USER_ID, 'etape-9', Buffer.from('x'), IMAGE_OPTIONS)
    ).rejects.toThrow(NotFoundError);
  });

  it('rejects reorder with a foreign étape id', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileByUserId.mockResolvedValue({ id: ARTISAN_PROFILE_ID });
    repository.getProcessusEtapes.mockResolvedValue([{ id: 'etape-1' }, { id: 'etape-2' }]);

    await expect(
      service.reorderProcessus(USER_ID, ['etape-1', 'etape-99'])
    ).rejects.toThrow(NotFoundError);
  });
});

describe('ArtisanProfileService — expositions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists expositions for the owner', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileByUserId.mockResolvedValue({ id: ARTISAN_PROFILE_ID });
    repository.getExpositions.mockResolvedValue([{ id: 'exp-1', annee: 2025 }]);

    const result = await service.getExpositions(USER_ID);

    expect(repository.getExpositions).toHaveBeenCalledWith(ARTISAN_PROFILE_ID);
    expect(result).toHaveLength(1);
  });

  it('creates an exposition', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileByUserId.mockResolvedValue({ id: ARTISAN_PROFILE_ID });
    repository.createExposition.mockResolvedValue({ id: 'exp-1', annee: 2025 });

    const result = await service.createExposition(USER_ID, {
      annee: 2025,
      evenement: 'Dak’Art',
      lieu: 'Sénégal',
    });

    expect(repository.createExposition).toHaveBeenCalledWith(ARTISAN_PROFILE_ID, {
      annee: 2025,
      evenement: 'Dak’Art',
      lieu: 'Sénégal',
    });
    expect(result.id).toBe('exp-1');
  });

  it('404 updating an exposition of another artisan', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileByUserId.mockResolvedValue({ id: ARTISAN_PROFILE_ID });
    repository.findExpositionById.mockResolvedValue({ id: 'exp-9', artisanId: 'AUTRE' });

    await expect(
      service.updateExposition(USER_ID, 'exp-9', { lieu: 'Lomé' })
    ).rejects.toThrow(NotFoundError);
  });

  it('404 deleting an exposition of another artisan', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileByUserId.mockResolvedValue({ id: ARTISAN_PROFILE_ID });
    repository.findExpositionById.mockResolvedValue({ id: 'exp-9', artisanId: 'AUTRE' });

    await expect(service.deleteExposition(USER_ID, 'exp-9')).rejects.toThrow(NotFoundError);
    expect(repository.deleteExposition).not.toHaveBeenCalled();
  });

  it('deletes an owned exposition', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileByUserId.mockResolvedValue({ id: ARTISAN_PROFILE_ID });
    repository.findExpositionById.mockResolvedValue({ id: 'exp-1', artisanId: ARTISAN_PROFILE_ID });
    repository.deleteExposition.mockResolvedValue({ id: 'exp-1' });

    await service.deleteExposition(USER_ID, 'exp-1');

    expect(repository.deleteExposition).toHaveBeenCalledWith('exp-1');
  });
});

describe('ArtisanProfileService — versements (privé)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('upserts a Mobile Money preference', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileByUserId.mockResolvedValue({ id: ARTISAN_PROFILE_ID });
    repository.upsertPaymentPreference.mockResolvedValue({ id: 'pref-1', methode: 'MOBILE_MONEY' });

    const result = await service.updateVersement(USER_ID, {
      methode: 'MOBILE_MONEY',
      mobileMoneyOperateur: 'Moov Money',
      mobileMoneyNumero: '+22890123456',
    });

    expect(repository.upsertPaymentPreference).toHaveBeenCalledWith(ARTISAN_PROFILE_ID, {
      methode: 'MOBILE_MONEY',
      mobileMoneyOperateur: 'Moov Money',
      mobileMoneyNumero: '+22890123456',
    });
    expect(result.methode).toBe('MOBILE_MONEY');
  });
});