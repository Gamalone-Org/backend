import type { PrismaClient } from '../../generated/prisma/client.js';
import type { CloudinaryService } from '../../shared/services/cloudinary/index.js';
import type {
  CloudinaryUploadInput,
  CloudinaryUploadOptions,
} from '../../shared/services/cloudinary/index.js';
import type { ArtisanFullProfile } from './artisan-profile.types.js';

export class ArtisanProfileRepository {
  private cloudinaryInstance: CloudinaryService | undefined;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly cloudinaryFactory: () => CloudinaryService
  ) {}

  private get cloudinary(): CloudinaryService {
    if (!this.cloudinaryInstance) {
      this.cloudinaryInstance = this.cloudinaryFactory();
    }
    return this.cloudinaryInstance;
  }

  async findArtisanProfileByUserId(userId: string) {
    return this.prisma.artisanProfile.findUnique({
      where: { userId },
    });
  }

  async findFullProfile(artisanId: string): Promise<ArtisanFullProfile | null> {
    return this.prisma.artisanProfile.findUnique({
      where: { id: artisanId },
      include: {
        user: {
          select: { id: true, email: true, nom: true, telephone: true },
        },
        atelierPhotos: {
          orderBy: { ordre: 'asc' },
        },
        processusEtapes: {
          orderBy: { ordre: 'asc' },
        },
        expositions: {
          orderBy: [{ annee: 'desc' }, { createdAt: 'desc' }],
        },
        paiementPreference: true,
      },
    }) as Promise<ArtisanFullProfile | null>;
  }

  async updateProfil(
    artisanId: string,
    data: {
      nomAtelier?: string;
      specialite?: string;
      anneeCreation?: number;
      ville?: string;
      pays?: string;
      bioCourte?: string;
      histoire?: string;
      siteWeb?: string;
      liensReseauxSociaux?: Record<string, string>;
      devise?: 'XOF' | 'EUR' | 'USD';
      langue?: 'fr' | 'en';
      preparationMinDays?: number;
      preparationMaxDays?: number;
    }
  ) {
    const { liensReseauxSociaux, ...rest } = data;
    const updateData: Record<string, unknown> = { ...rest };
    if (liensReseauxSociaux !== undefined) {
      updateData.liensReseauxSociaux = liensReseauxSociaux;
    }
    return this.prisma.artisanProfile.update({
      where: { id: artisanId },
      data: updateData as never,
    });
  }

  // ---------------------------------------------------------------------------
  // Photo profil
  // ---------------------------------------------------------------------------

  async uploadPhotoProfil(
    artisanId: string,
    file: CloudinaryUploadInput,
    options: CloudinaryUploadOptions
  ) {
    const existing = await this.prisma.artisanProfile.findUnique({
      where: { id: artisanId },
      select: { photoProfilPublicId: true },
    });

    if (existing?.photoProfilPublicId) {
      await this.cloudinary.deleteAsset(existing.photoProfilPublicId, 'image');
    }

    const result = await this.cloudinary.uploadImage(file, options);

    return this.prisma.artisanProfile.update({
      where: { id: artisanId },
      data: {
        photoProfilUrl: result.secureUrl,
        photoProfilPublicId: result.publicId,
        photoProfilMimeType: options.mimeType,
        photoProfilSize: options.bytes,
      },
    });
  }

  async deletePhotoProfil(artisanId: string) {
    const existing = await this.prisma.artisanProfile.findUnique({
      where: { id: artisanId },
      select: { photoProfilPublicId: true },
    });

    if (existing?.photoProfilPublicId) {
      await this.cloudinary.deleteAsset(existing.photoProfilPublicId, 'image');
    }

    return this.prisma.artisanProfile.update({
      where: { id: artisanId },
      data: {
        photoProfilUrl: null,
        photoProfilPublicId: null,
        photoProfilMimeType: null,
        photoProfilSize: null,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Bannière
  // ---------------------------------------------------------------------------

  async uploadBanniere(
    artisanId: string,
    file: CloudinaryUploadInput,
    options: CloudinaryUploadOptions
  ) {
    const existing = await this.prisma.artisanProfile.findUnique({
      where: { id: artisanId },
      select: { photoBannierePublicId: true },
    });

    if (existing?.photoBannierePublicId) {
      await this.cloudinary.deleteAsset(existing.photoBannierePublicId, 'image');
    }

    const result = await this.cloudinary.uploadImage(file, options);

    return this.prisma.artisanProfile.update({
      where: { id: artisanId },
      data: {
        photoBanniereUrl: result.secureUrl,
        photoBannierePublicId: result.publicId,
        photoBanniereMimeType: options.mimeType,
        photoBanniereSize: options.bytes,
      },
    });
  }

  async deleteBanniere(artisanId: string) {
    const existing = await this.prisma.artisanProfile.findUnique({
      where: { id: artisanId },
      select: { photoBannierePublicId: true },
    });

    if (existing?.photoBannierePublicId) {
      await this.cloudinary.deleteAsset(existing.photoBannierePublicId, 'image');
    }

    return this.prisma.artisanProfile.update({
      where: { id: artisanId },
      data: {
        photoBanniereUrl: null,
        photoBannierePublicId: null,
        photoBanniereMimeType: null,
        photoBanniereSize: null,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Photos atelier
  // ---------------------------------------------------------------------------

  async countAtelierPhotos(artisanId: string) {
    return this.prisma.artisanAtelierPhoto.count({
      where: { artisanId },
    });
  }

  async getAtelierPhotos(artisanId: string) {
    return this.prisma.artisanAtelierPhoto.findMany({
      where: { artisanId },
      orderBy: { ordre: 'asc' },
    });
  }

  async uploadAtelierPhoto(
    artisanId: string,
    file: CloudinaryUploadInput,
    options: CloudinaryUploadOptions
  ) {
    const maxOrdre = await this.prisma.artisanAtelierPhoto.findFirst({
      where: { artisanId },
      orderBy: { ordre: 'desc' },
      select: { ordre: true },
    });

    const nextOrdre = (maxOrdre?.ordre ?? -1) + 1;
    const result = await this.cloudinary.uploadImage(file, options);

    return this.prisma.artisanAtelierPhoto.create({
      data: {
        artisanId,
        url: result.secureUrl,
        publicId: result.publicId,
        mimeType: options.mimeType,
        size: options.bytes,
        ordre: nextOrdre,
      },
    });
  }

  async findAtelierPhotoById(photoId: string) {
    return this.prisma.artisanAtelierPhoto.findUnique({
      where: { id: photoId },
    });
  }

  async deleteAtelierPhoto(photoId: string) {
    const photo = await this.prisma.artisanAtelierPhoto.findUnique({
      where: { id: photoId },
    });
    if (!photo) return null;

    await this.cloudinary.deleteAsset(photo.publicId, 'image');
    return this.prisma.artisanAtelierPhoto.delete({
      where: { id: photoId },
    });
  }

  async reorderAtelierPhotos(artisanId: string, photoIds: string[]) {
    return this.prisma.$transaction(async (tx) => {
      const updates = photoIds.map((photoId, index) =>
        tx.artisanAtelierPhoto.update({
          where: { id: photoId, artisanId },
          data: { ordre: index },
        })
      );
      return Promise.all(updates);
    });
  }

  // ---------------------------------------------------------------------------
  // Processus de création
  // ---------------------------------------------------------------------------

  async countProcessusEtapes(artisanId: string) {
    return this.prisma.creationProcessus.count({
      where: { artisanId },
    });
  }

  async getProcessusEtapes(artisanId: string) {
    return this.prisma.creationProcessus.findMany({
      where: { artisanId },
      orderBy: { ordre: 'asc' },
    });
  }

  async createProcessusEtape(
    artisanId: string,
    data: { ordre: number; legende: string }
  ) {
    return this.prisma.creationProcessus.create({
      data: {
        artisanId,
        ordre: data.ordre,
        legende: data.legende,
      },
    });
  }

  async findProcessusEtapeById(etapeId: string) {
    return this.prisma.creationProcessus.findUnique({
      where: { id: etapeId },
    });
  }

  async updateProcessusEtape(
    etapeId: string,
    data: { legende?: string; ordre?: number }
  ) {
    return this.prisma.creationProcessus.update({
      where: { id: etapeId },
      data,
    });
  }

  async deleteProcessusEtape(etapeId: string) {
    const etape = await this.prisma.creationProcessus.findUnique({
      where: { id: etapeId },
    });
    if (!etape) return null;

    if (etape.photoPublicId) {
      await this.cloudinary.deleteAsset(etape.photoPublicId, 'image');
    }

    return this.prisma.creationProcessus.delete({
      where: { id: etapeId },
    });
  }

  async uploadProcessusPhoto(
    etapeId: string,
    file: CloudinaryUploadInput,
    options: CloudinaryUploadOptions
  ) {
    const existing = await this.prisma.creationProcessus.findUnique({
      where: { id: etapeId },
      select: { photoPublicId: true },
    });

    if (existing?.photoPublicId) {
      await this.cloudinary.deleteAsset(existing.photoPublicId, 'image');
    }

    const result = await this.cloudinary.uploadImage(file, options);

    return this.prisma.creationProcessus.update({
      where: { id: etapeId },
      data: {
        photoUrl: result.secureUrl,
        photoPublicId: result.publicId,
        photoMimeType: options.mimeType,
        photoSize: options.bytes,
      },
    });
  }

  async reorderProcessus(artisanId: string, etapeIds: string[]) {
    return this.prisma.$transaction(async (tx) => {
      const updates = etapeIds.map((etapeId, index) =>
        tx.creationProcessus.update({
          where: { id: etapeId, artisanId },
          data: { ordre: index + 1 },
        })
      );
      return Promise.all(updates);
    });
  }

  // ---------------------------------------------------------------------------
  // Expositions
  // ---------------------------------------------------------------------------

  async getExpositions(artisanId: string) {
    return this.prisma.exposition.findMany({
      where: { artisanId },
      orderBy: [{ annee: 'desc' }, { createdAt: 'desc' }],
    });
  }

  async createExposition(
    artisanId: string,
    data: { annee: number; evenement: string; lieu: string }
  ) {
    return this.prisma.exposition.create({
      data: {
        artisanId,
        annee: data.annee,
        evenement: data.evenement,
        lieu: data.lieu,
      },
    });
  }

  async findExpositionById(expositionId: string) {
    return this.prisma.exposition.findUnique({
      where: { id: expositionId },
    });
  }

  async updateExposition(
    expositionId: string,
    data: { annee?: number; evenement?: string; lieu?: string }
  ) {
    return this.prisma.exposition.update({
      where: { id: expositionId },
      data,
    });
  }

  async deleteExposition(expositionId: string) {
    return this.prisma.exposition.delete({
      where: { id: expositionId },
    });
  }

  // ---------------------------------------------------------------------------
  // Payment preferences (privé)
  // ---------------------------------------------------------------------------

  async upsertPaymentPreference(
    artisanId: string,
    data: {
      methode: 'MOBILE_MONEY' | 'VIREMENT_BANCAIRE';
      mobileMoneyOperateur?: string;
      mobileMoneyNumero?: string;
      virementNomBanque?: string;
      virementIban?: string;
      virementNomCompte?: string;
    }
  ) {
    return this.prisma.artisanPaymentPreference.upsert({
      where: { artisanId },
      create: { artisanId, ...data },
      update: data,
    });
  }
}
