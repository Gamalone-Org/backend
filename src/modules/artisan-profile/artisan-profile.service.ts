import { ArtisanProfileRepository } from './artisan-profile.repository.js';
import {
  MAX_ATELIER_PHOTOS,
  MAX_PROCESSUS_ETAPES,
  ALLOWED_IMAGE_MIME_TYPES,
} from './artisan-profile.types.js';
import {
  NotFoundError,
  ForbiddenError,
  ConflictError,
  ValidationError,
} from '../../common/errors/AppError.js';
import type {
  CloudinaryUploadInput,
  CloudinaryUploadOptions,
} from '../../shared/services/cloudinary/index.js';

export class ArtisanProfileService {
  constructor(private readonly repository: ArtisanProfileRepository) {}

  private assertAllowedMimeType(mimeType: string) {
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(mimeType as (typeof ALLOWED_IMAGE_MIME_TYPES)[number])) {
      throw new ValidationError("Format d'image non autorisé. Formats acceptés : JPEG, PNG, WEBP");
    }
  }

  private async resolveArtisanId(userId: string) {
    const profile = await this.repository.findArtisanProfileByUserId(userId);
    if (!profile) {
      throw new ForbiddenError('Profil artisan non trouvé');
    }
    return profile.id;
  }

  // ---------------------------------------------------------------------------
  // Profil principal
  // ---------------------------------------------------------------------------

  async getMyProfile(userId: string) {
    const artisanId = await this.resolveArtisanId(userId);
    const profile = await this.repository.findFullProfile(artisanId);
    if (!profile) {
      throw new NotFoundError('Profil artisan non trouvé');
    }
    return profile;
  }

  async updateMyProfile(userId: string, data: {
    nomAtelier?: string;
    specialite?: string;
    anneeCreation?: number;
    ville?: string;
    pays?: string;
    bioCourte?: string;
    histoire?: string;
    siteWeb?: string;
    instagram?: string;
    facebook?: string;
    whatsapp?: string;
    devise?: 'XOF' | 'EUR' | 'USD';
    langue?: 'fr' | 'en';
    preparationMinDays?: number;
    preparationMaxDays?: number;
  }) {
    const artisanId = await this.resolveArtisanId(userId);

    const { instagram, facebook, whatsapp, ...directFields } = data;

    const updateData: Record<string, string | number | Record<string, string> | undefined> = { ...directFields };

    if (instagram !== undefined || facebook !== undefined || whatsapp !== undefined) {
      const currentProfile = await this.repository.findFullProfile(artisanId);
      const currentLinks = (currentProfile?.liensReseauxSociaux as Record<string, string>) ?? {};

      const mergedLinks: Record<string, string> = { ...currentLinks };
      if (instagram !== undefined) mergedLinks.instagram = instagram;
      if (facebook !== undefined) mergedLinks.facebook = facebook;
      if (whatsapp !== undefined) mergedLinks.whatsapp = whatsapp;

      updateData.liensReseauxSociaux = mergedLinks;
    }

    if (data.preparationMinDays !== undefined || data.preparationMaxDays !== undefined) {
      const currentProfile = await this.repository.findFullProfile(artisanId);
      const min = data.preparationMinDays ?? currentProfile?.preparationMinDays ?? 0;
      const max = data.preparationMaxDays ?? currentProfile?.preparationMaxDays ?? 0;
      if (max < min) {
        throw new ValidationError('Le délai maximum doit être supérieur ou égal au délai minimum');
      }
    }

    return this.repository.updateProfil(artisanId, updateData as Parameters<typeof this.repository.updateProfil>[1]);
  }

  // ---------------------------------------------------------------------------
  // Photo profil
  // ---------------------------------------------------------------------------

  async uploadPhotoProfil(userId: string, file: CloudinaryUploadInput, options: CloudinaryUploadOptions) {
    const artisanId = await this.resolveArtisanId(userId);
    this.assertAllowedMimeType(options.mimeType);
    return this.repository.uploadPhotoProfil(artisanId, file, options);
  }

  async deletePhotoProfil(userId: string) {
    const artisanId = await this.resolveArtisanId(userId);
    const profile = await this.repository.findFullProfile(artisanId);
    if (!profile?.photoProfilPublicId) {
      throw new NotFoundError('Photo de profil non trouvée');
    }
    return this.repository.deletePhotoProfil(artisanId);
  }

  // ---------------------------------------------------------------------------
  // Bannière
  // ---------------------------------------------------------------------------

  async uploadBanniere(userId: string, file: CloudinaryUploadInput, options: CloudinaryUploadOptions) {
    const artisanId = await this.resolveArtisanId(userId);
    this.assertAllowedMimeType(options.mimeType);
    return this.repository.uploadBanniere(artisanId, file, options);
  }

  async deleteBanniere(userId: string) {
    const artisanId = await this.resolveArtisanId(userId);
    const profile = await this.repository.findFullProfile(artisanId);
    if (!profile?.photoBannierePublicId) {
      throw new NotFoundError('Bannière non trouvée');
    }
    return this.repository.deleteBanniere(artisanId);
  }

  // ---------------------------------------------------------------------------
  // Photos atelier
  // ---------------------------------------------------------------------------

  async getAtelierPhotos(userId: string) {
    const artisanId = await this.resolveArtisanId(userId);
    return this.repository.getAtelierPhotos(artisanId);
  }

  async uploadAtelierPhoto(userId: string, file: CloudinaryUploadInput, options: CloudinaryUploadOptions) {
    const artisanId = await this.resolveArtisanId(userId);
    this.assertAllowedMimeType(options.mimeType);

    const count = await this.repository.countAtelierPhotos(artisanId);
    if (count >= MAX_ATELIER_PHOTOS) {
      throw new ConflictError(`Maximum ${MAX_ATELIER_PHOTOS} photos pour l'atelier`);
    }

    return this.repository.uploadAtelierPhoto(artisanId, file, options);
  }

  async deleteAtelierPhoto(userId: string, photoId: string) {
    const artisanId = await this.resolveArtisanId(userId);
    const photo = await this.repository.findAtelierPhotoById(photoId);
    if (!photo || photo.artisanId !== artisanId) {
      throw new NotFoundError('Photo atelier non trouvée');
    }
    return this.repository.deleteAtelierPhoto(photoId);
  }

  async reorderAtelierPhotos(userId: string, photoIds: string[]) {
    const artisanId = await this.resolveArtisanId(userId);
    const existing = await this.repository.getAtelierPhotos(artisanId);
    const existingIds = new Set(existing.map((p) => p.id));

    for (const id of photoIds) {
      if (!existingIds.has(id)) {
        throw new NotFoundError(`Photo ${id} n'appartient pas à votre atelier`);
      }
    }

    if (photoIds.length !== existing.length) {
      throw new ValidationError('La liste doit contenir toutes les photos de votre atelier');
    }

    const uniqueIds = new Set(photoIds);
    if (uniqueIds.size !== photoIds.length) {
      throw new ValidationError('Doublon détecté dans la liste des photos');
    }

    return this.repository.reorderAtelierPhotos(artisanId, photoIds);
  }

  // ---------------------------------------------------------------------------
  // Processus de création
  // ---------------------------------------------------------------------------

  async getProcessus(userId: string) {
    const artisanId = await this.resolveArtisanId(userId);
    return this.repository.getProcessusEtapes(artisanId);
  }

  async createProcessusEtape(userId: string, data: { ordre: number; legende: string }) {
    const artisanId = await this.resolveArtisanId(userId);

    const count = await this.repository.countProcessusEtapes(artisanId);
    if (count >= MAX_PROCESSUS_ETAPES) {
      throw new ConflictError(`Maximum ${MAX_PROCESSUS_ETAPES} étapes dans le processus de création`);
    }

    const existing = await this.repository.getProcessusEtapes(artisanId);
    const ordres = existing.map((e) => e.ordre);
    if (ordres.includes(data.ordre)) {
      throw new ConflictError(`L'ordre ${data.ordre} est déjà utilisé`);
    }

    return this.repository.createProcessusEtape(artisanId, data);
  }

  async updateProcessusEtape(userId: string, etapeId: string, data: { legende?: string }) {
    const artisanId = await this.resolveArtisanId(userId);
    const etape = await this.repository.findProcessusEtapeById(etapeId);
    if (!etape || etape.artisanId !== artisanId) {
      throw new NotFoundError('Étape du processus non trouvée');
    }
    return this.repository.updateProcessusEtape(etapeId, data);
  }

  async deleteProcessusEtape(userId: string, etapeId: string) {
    const artisanId = await this.resolveArtisanId(userId);
    const etape = await this.repository.findProcessusEtapeById(etapeId);
    if (!etape || etape.artisanId !== artisanId) {
      throw new NotFoundError('Étape du processus non trouvée');
    }
    return this.repository.deleteProcessusEtape(etapeId);
  }

  async uploadProcessusPhoto(
    userId: string,
    etapeId: string,
    file: CloudinaryUploadInput,
    options: CloudinaryUploadOptions
  ) {
    const artisanId = await this.resolveArtisanId(userId);
    const etape = await this.repository.findProcessusEtapeById(etapeId);
    if (!etape || etape.artisanId !== artisanId) {
      throw new NotFoundError('Étape du processus non trouvée');
    }
    this.assertAllowedMimeType(options.mimeType);
    return this.repository.uploadProcessusPhoto(etapeId, file, options);
  }

  async reorderProcessus(userId: string, etapeIds: string[]) {
    const artisanId = await this.resolveArtisanId(userId);
    const existing = await this.repository.getProcessusEtapes(artisanId);
    const existingIds = new Set(existing.map((e) => e.id));

    for (const id of etapeIds) {
      if (!existingIds.has(id)) {
        throw new NotFoundError(`Étape ${id} n'appartient pas à votre processus`);
      }
    }

    if (etapeIds.length !== existing.length) {
      throw new ValidationError('La liste doit contenir toutes les étapes de votre processus');
    }

    const uniqueIds = new Set(etapeIds);
    if (uniqueIds.size !== etapeIds.length) {
      throw new ValidationError('Doublon détecté dans la liste des étapes');
    }

    return this.repository.reorderProcessus(artisanId, etapeIds);
  }

  // ---------------------------------------------------------------------------
  // Expositions
  // ---------------------------------------------------------------------------

  async getExpositions(userId: string) {
    const artisanId = await this.resolveArtisanId(userId);
    return this.repository.getExpositions(artisanId);
  }

  async createExposition(userId: string, data: { annee: number; evenement: string; lieu: string }) {
    const artisanId = await this.resolveArtisanId(userId);
    return this.repository.createExposition(artisanId, data);
  }

  async updateExposition(userId: string, expositionId: string, data: { annee?: number; evenement?: string; lieu?: string }) {
    const artisanId = await this.resolveArtisanId(userId);
    const exposition = await this.repository.findExpositionById(expositionId);
    if (!exposition || exposition.artisanId !== artisanId) {
      throw new NotFoundError('Exposition non trouvée');
    }
    return this.repository.updateExposition(expositionId, data);
  }

  async deleteExposition(userId: string, expositionId: string) {
    const artisanId = await this.resolveArtisanId(userId);
    const exposition = await this.repository.findExpositionById(expositionId);
    if (!exposition || exposition.artisanId !== artisanId) {
      throw new NotFoundError('Exposition non trouvée');
    }
    return this.repository.deleteExposition(expositionId);
  }

  // ---------------------------------------------------------------------------
  // Versements (privé)
  // ---------------------------------------------------------------------------

  async updateVersement(userId: string, data: {
    methode: 'MOBILE_MONEY' | 'VIREMENT_BANCAIRE';
    mobileMoneyOperateur?: string;
    mobileMoneyNumero?: string;
    virementNomBanque?: string;
    virementIban?: string;
    virementNomCompte?: string;
  }) {
    const artisanId = await this.resolveArtisanId(userId);
    return this.repository.upsertPaymentPreference(artisanId, data);
  }
}
