import { MediaRepository } from './media.repository.js';
import { OeuvreRepository } from './oeuvre.repository.js';
import {
  MAX_OEUVRE_MEDIAS,
  MAX_PREPARATION_MEDIAS,
  MEDIA_TYPE_LIMITS,
  ALLOWED_IMAGE_MIME_TYPES,
} from './types.js';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/AppError.js';
import type { MediaType } from '../../generated/prisma/client.js';
import type {
  CloudinaryUploadInput,
  CloudinaryUploadOptions,
} from '../../shared/services/cloudinary/index.js';

export class MediaService {
  constructor(
    private readonly mediaRepository: MediaRepository,
    private readonly oeuvreRepository: OeuvreRepository
  ) {}

  async uploadMedia(
    oeuvreId: string,
    file: CloudinaryUploadInput,
    options: CloudinaryUploadOptions,
    metadata: { width?: number; height?: number },
    type: 'OEUVRE' | 'PREPARATION' = 'OEUVRE'
  ) {
    const oeuvre = await this.oeuvreRepository.findById(oeuvreId);
    if (!oeuvre) {
      throw new NotFoundError('Œuvre non trouvée');
    }

    this.assertAllowedMimeType(options.mimeType);

    const mediaCount = await this.oeuvreRepository.countMedias(oeuvreId, type);
    const limit = MEDIA_TYPE_LIMITS[type];
    if (mediaCount >= limit) {
      const label = type === 'OEUVRE' ? MAX_OEUVRE_MEDIAS : MAX_PREPARATION_MEDIAS;
      throw new ConflictError(
        `Maximum ${label} images ${type === 'OEUVRE' ? 'par œuvre' : 'de préparation par œuvre'}`
      );
    }

    const nextOrdre = (await this.mediaRepository.getMaxOrdre(oeuvreId, type)) + 1;

    return this.mediaRepository.uploadAndCreate(file, options, metadata, oeuvreId, nextOrdre, type);
  }

  async deleteMedia(oeuvreId: string, mediaId: string) {
    const oeuvre = await this.oeuvreRepository.findById(oeuvreId);
    if (!oeuvre) {
      throw new NotFoundError('Œuvre non trouvée');
    }

    const media = await this.oeuvreRepository.findMediaById(mediaId);
    if (!media || media.oeuvreId !== oeuvreId) {
      throw new NotFoundError('Média non trouvé');
    }

    const result = await this.mediaRepository.deleteMediaAndCloudinary(mediaId);
    if (!result) {
      throw new NotFoundError('Média non trouvé');
    }

    return result;
  }

  async reorderMedias(oeuvreId: string, mediaIds: string[]) {
    const oeuvre = await this.oeuvreRepository.findById(oeuvreId);
    if (!oeuvre) {
      throw new NotFoundError('Œuvre non trouvée');
    }

    const existingMedias = await this.oeuvreRepository.getMediasByOeuvreId(oeuvreId);
    const existingIds = new Set(existingMedias.map((m) => m.id));

    for (const id of mediaIds) {
      if (!existingIds.has(id)) {
        throw new NotFoundError(`Média ${id} n'appartient pas à cette œuvre`);
      }
    }

    if (mediaIds.length !== existingMedias.length) {
      throw new ValidationError("La liste doit contenir tous les médias de l'œuvre");
    }

    const uniqueIds = new Set(mediaIds);
    if (uniqueIds.size !== mediaIds.length) {
      throw new ValidationError('Doublon détecté dans la liste des médias');
    }

    return this.oeuvreRepository.reorderMedias(oeuvreId, mediaIds);
  }

  async setPhotoAtelier(artisanId: string, file: CloudinaryUploadInput, options: CloudinaryUploadOptions) {
    const profile = await this.oeuvreRepository.findArtisanProfileById(artisanId);
    if (!profile) {
      throw new NotFoundError('Profil artisan non trouvé');
    }

    this.assertAllowedMimeType(options.mimeType);

    const result = await this.oeuvreRepository.setPhotoAtelier(
      profile.id,
      await this.mediaRepository.uploadAtelier(file, options)
    );

    return {
      artisanProfileId: profile.id,
      photoAtelierUrl: result.photoAtelierUrl,
      photoAtelierMimeType: result.photoAtelierMimeType,
      photoAtelierSize: result.photoAtelierSize,
    };
  }

  async deletePhotoAtelier(artisanId: string) {
    const profile = await this.oeuvreRepository.findArtisanProfileById(artisanId);
    if (!profile) {
      throw new NotFoundError('Profil artisan non trouvé');
    }
    if (!profile.photoAtelierPublicId) {
      throw new NotFoundError('Photo atelier non trouvée');
    }

    await this.mediaRepository.deleteAsset(profile.photoAtelierPublicId);

    return this.oeuvreRepository.setPhotoAtelier(profile.id, {
      url: '',
      publicId: '',
      mimeType: '',
      size: 0,
    });
  }

  private assertAllowedMimeType(mimeType: string) {
    if (
      !ALLOWED_IMAGE_MIME_TYPES.includes(mimeType as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])
    ) {
      throw new ValidationError("Format d'image non autorisé. Formats acceptés : JPEG, PNG, WEBP");
    }
  }
}

export type { MediaType };
