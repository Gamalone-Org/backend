import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaService } from '../../src/modules/marketplace/media.service';
import { MediaRepository } from '../../src/modules/marketplace/media.repository';
import { NotFoundError, ConflictError, ValidationError } from '../../src/common/errors/AppError';
import { MAX_OEUVRE_MEDIAS, MAX_PREPARATION_MEDIAS } from '../../src/modules/marketplace/types';

function buildService(overrides = {}) {
  const oeuvreRepository = {
    findById: vi.fn(),
    findArtisanProfileById: vi.fn(),
    countMedias: vi.fn(),
    findMediaById: vi.fn(),
    getMediasByOeuvreId: vi.fn(),
    reorderMedias: vi.fn(),
    ...overrides.oeuvreRepository,
  } as any;
  const mediaRepository = {
    uploadAndCreate: vi.fn(),
    deleteMediaAndCloudinary: vi.fn(),
    getMaxOrdre: vi.fn(),
    ...overrides.mediaRepository,
  } as any;
  return {
    service: new MediaService(
      mediaRepository as unknown as MediaRepository,
      oeuvreRepository as unknown as any
    ),
    oeuvreRepository,
    mediaRepository,
  };
}

const options = { domain: 'artworks' as const, mimeType: 'image/jpeg', bytes: 1000 };

describe('MediaService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('enforces the maximum number of OEUVRE images per oeuvre', async () => {
    const { service, oeuvreRepository, mediaRepository } = buildService();
    oeuvreRepository.findById.mockResolvedValue({ id: 'oeuvre-1', artisanId: 'artisan-1' });
    oeuvreRepository.countMedias.mockResolvedValue(MAX_OEUVRE_MEDIAS);

    await expect(
      service.uploadMedia('oeuvre-1', Buffer.from('x'), options, {})
    ).rejects.toThrow(ConflictError);
    expect(mediaRepository.uploadAndCreate).not.toHaveBeenCalled();
  });

  it('enforces the maximum number of PREPARATION images per oeuvre', async () => {
    const { service, oeuvreRepository, mediaRepository } = buildService();
    oeuvreRepository.findById.mockResolvedValue({ id: 'oeuvre-1', artisanId: 'artisan-1' });
    oeuvreRepository.countMedias.mockResolvedValue(MAX_PREPARATION_MEDIAS);

    await expect(
      service.uploadMedia('oeuvre-1', Buffer.from('x'), options, {}, 'PREPARATION')
    ).rejects.toThrow(ConflictError);
    expect(mediaRepository.uploadAndCreate).not.toHaveBeenCalled();
  });

  it('rejects a non-image mime type', async () => {
    const { service, oeuvreRepository, mediaRepository } = buildService();
    oeuvreRepository.findById.mockResolvedValue({ id: 'oeuvre-1', artisanId: 'artisan-1' });

    await expect(
      service.uploadMedia('oeuvre-1', Buffer.from('x'), {
        domain: 'artworks',
        mimeType: 'application/pdf',
        bytes: 1000,
      }, {})
    ).rejects.toThrow(ValidationError);
    expect(mediaRepository.uploadAndCreate).not.toHaveBeenCalled();
  });

  it('rejects upload on a non-existent oeuvre', async () => {
    const { service, oeuvreRepository, mediaRepository } = buildService();
    oeuvreRepository.findById.mockResolvedValue(null);

    await expect(
      service.uploadMedia('oeuvre-x', Buffer.from('x'), options, {})
    ).rejects.toThrow(NotFoundError);
    expect(mediaRepository.uploadAndCreate).not.toHaveBeenCalled();
  });

  it('throws NotFoundError for a media that does not belong to the oeuvre', async () => {
    const { service, oeuvreRepository } = buildService();
    oeuvreRepository.findById.mockResolvedValue({ id: 'oeuvre-1', artisanId: 'artisan-1' });
    oeuvreRepository.findMediaById.mockResolvedValue({ id: 'media-9', oeuvreId: 'oeuvre-OTHER' });

    await expect(service.deleteMedia('oeuvre-1', 'media-9')).rejects.toThrow(NotFoundError);
  });

  it('reorders medias and verifies completeness', async () => {
    const { service, oeuvreRepository } = buildService();
    oeuvreRepository.findById.mockResolvedValue({ id: 'oeuvre-1', artisanId: 'artisan-1' });
    oeuvreRepository.getMediasByOeuvreId.mockResolvedValue([
      { id: 'media-1', ordre: 0 },
      { id: 'media-2', ordre: 1 },
    ]);
    oeuvreRepository.reorderMedias.mockResolvedValue([{}, {}]);

    await service.reorderMedias('oeuvre-1', ['media-1', 'media-2']);
    expect(oeuvreRepository.reorderMedias).toHaveBeenCalledWith('oeuvre-1', ['media-1', 'media-2']);
  });

  it('rejects reorder with a media not belonging to the oeuvre', async () => {
    const { service, oeuvreRepository } = buildService();
    oeuvreRepository.findById.mockResolvedValue({ id: 'oeuvre-1', artisanId: 'artisan-1' });
    oeuvreRepository.getMediasByOeuvreId.mockResolvedValue([{ id: 'media-1' }, { id: 'media-2' }]);

    await expect(
      service.reorderMedias('oeuvre-1', ['media-1', 'media-EXTRA'])
    ).rejects.toThrow(NotFoundError);
  });

  it('rejects reorder with a duplicate media id', async () => {
    const { service, oeuvreRepository } = buildService();
    oeuvreRepository.findById.mockResolvedValue({ id: 'oeuvre-1', artisanId: 'artisan-1' });
    oeuvreRepository.getMediasByOeuvreId.mockResolvedValue([{ id: 'media-1' }, { id: 'media-2' }]);

    await expect(
      service.reorderMedias('oeuvre-1', ['media-1', 'media-1'])
    ).rejects.toThrow(ValidationError);
  });

  it('rejects reorder when the list is not complete', async () => {
    const { service, oeuvreRepository } = buildService();
    oeuvreRepository.findById.mockResolvedValue({ id: 'oeuvre-1', artisanId: 'artisan-1' });
    oeuvreRepository.getMediasByOeuvreId.mockResolvedValue([
      { id: 'media-1' },
      { id: 'media-2' },
      { id: 'media-3' },
    ]);

    await expect(
      service.reorderMedias('oeuvre-1', ['media-1', 'media-2'])
    ).rejects.toThrow(ValidationError);
  });
});
