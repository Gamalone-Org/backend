import { createHash, randomUUID } from 'node:crypto';
import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
import type { ArtworkStatus, MediaType } from '../../generated/prisma/client.js';
import type { PublicOeuvreSelect, AdminOeuvreSelect } from './types.js';

export class OeuvreRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    titre: string;
    description: string;
    technique: string;
    materiaux: string;
    dimensions: string;
    poids?: number;
    anneeCreation: number;
    prixXOF: number;
    artisanId: string;
    categorieId: string;
  }) {
    return this.prisma.oeuvre.create({
      data: {
        titre: data.titre,
        description: data.description,
        technique: data.technique,
        materiaux: data.materiaux,
        dimensions: data.dimensions,
        poids: data.poids ?? null,
        anneeCreation: data.anneeCreation,
        prixXOF: data.prixXOF,
        artisanId: data.artisanId,
        categorieId: data.categorieId,
      },
    });
  }

  async findById(id: string) {
    return this.prisma.oeuvre.findUnique({
      where: { id },
      include: {
        artisan: {
          include: {
            user: {
              select: { id: true, nom: true, telephone: true },
            },
          },
        },
        categorie: true,
        medias: { orderBy: { ordre: 'asc' } },
        certificat: true,
      },
    });
  }

  async findByIdPublic(id: string, select: PublicOeuvreSelect) {
    return this.prisma.oeuvre.findUnique({
      where: { id, statut: 'PUBLIEE' },
      select,
    });
  }

  async findByArtisanId(artisanId: string, page: number, limit: number, statut?: ArtworkStatus) {
    const where = { artisanId, ...(statut ? { statut } : {}) };
    const [oeuvres, total] = await Promise.all([
      this.prisma.oeuvre.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          medias: { orderBy: { ordre: 'asc' }, select: { id: true, url: true, ordre: true } },
          categorie: { select: { id: true, nom: true } },
        },
      }),
      this.prisma.oeuvre.count({ where }),
    ]);
    return { oeuvres, total };
  }

  async findPublishedPublic(
    page: number,
    limit: number,
    filters: {
      categorieId?: string;
      prixMin?: number;
      prixMax?: number;
      artisanType?: string;
      localisation?: string;
      q?: string;
      tri?: string;
    },
    select: PublicOeuvreSelect
  ) {
    const where: Record<string, unknown> = { statut: 'PUBLIEE' };

    if (filters.categorieId) {
      where.categorieId = filters.categorieId;
    }

    if (filters.prixMin !== undefined || filters.prixMax !== undefined) {
      where.prixXOF = {};
      const prixWhere = where.prixXOF as Record<string, number>;
      if (filters.prixMin !== undefined) prixWhere.gte = filters.prixMin;
      if (filters.prixMax !== undefined) prixWhere.lte = filters.prixMax;
    }

    if (filters.q) {
      where.OR = [
        { titre: { contains: filters.q, mode: 'insensitive' } },
        { description: { contains: filters.q, mode: 'insensitive' } },
      ];
    }

    if (filters.artisanType || filters.localisation) {
      where.artisan = {};
      const artisanWhere = where.artisan as Record<string, unknown>;
      if (filters.artisanType) artisanWhere.type = filters.artisanType;
      if (filters.localisation)
        artisanWhere.localisation = { contains: filters.localisation, mode: 'insensitive' };
    }

    let orderBy: Record<string, string> = { createdAt: 'desc' };
    if (filters.tri) {
      const [field, direction] = filters.tri.split('_');
      if (field && direction) {
        orderBy = { [field]: direction };
      }
    }

    const [oeuvres, total] = await Promise.all([
      this.prisma.oeuvre.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select,
      }),
      this.prisma.oeuvre.count({ where }),
    ]);

    return { oeuvres, total };
  }

  async findFeatured(limit: number, select: PublicOeuvreSelect) {
    return this.prisma.oeuvre.findMany({
      where: { statut: 'PUBLIEE', estMiseEnAvant: true },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select,
    });
  }

  async findPublishedByArtisan(
    artisanId: string,
    page: number,
    limit: number,
    select: PublicOeuvreSelect
  ) {
    const where = { artisanId, statut: 'PUBLIEE' as const };
    const [oeuvres, total] = await Promise.all([
      this.prisma.oeuvre.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select,
      }),
      this.prisma.oeuvre.count({ where }),
    ]);
    return { oeuvres, total };
  }

  async findAllAdmin(
    page: number,
    limit: number,
    filters: {
      statut?: ArtworkStatus;
      artisanId?: string;
      categorieId?: string;
    },
    select: AdminOeuvreSelect
  ) {
    const where: Record<string, unknown> = {};
    if (filters.statut) where.statut = filters.statut;
    if (filters.artisanId) where.artisanId = filters.artisanId;
    if (filters.categorieId) where.categorieId = filters.categorieId;

    const [oeuvres, total] = await Promise.all([
      this.prisma.oeuvre.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select,
      }),
      this.prisma.oeuvre.count({ where }),
    ]);
    return { oeuvres, total };
  }

  async update(
    id: string,
    data: {
      titre?: string;
      description?: string;
      technique?: string;
      materiaux?: string;
      dimensions?: string;
      poids?: number | null;
      anneeCreation?: number;
      prixXOF?: number;
      categorieId?: string;
      estMiseEnAvant?: boolean;
    }
  ) {
    return this.prisma.oeuvre.update({
      where: { id },
      data,
    });
  }

  async updateStatut(id: string, statut: ArtworkStatus, publishedByAdminId?: string) {
    return this.prisma.oeuvre.update({
      where: { id },
      data: {
        statut,
        ...(publishedByAdminId !== undefined ? { publishedByAdminId } : {}),
      },
    });
  }

  async publish(id: string, adminProfileId: string) {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.oeuvre.update({
        where: { id },
        data: {
          statut: 'PUBLIEE',
          publishedByAdminId: adminProfileId,
          rejectionReason: null,
        },
      });

      await tx.certificat.create({
        data: {
          codeQR: randomUUID(),
          hashOeuvre: await this.computeOeuvreHash(tx, id),
          estValide: true,
          oeuvreId: id,
        },
      });

      return updated;
    });
  }

  private async computeOeuvreHash(tx: Prisma.TransactionClient, oeuvreId: string): Promise<string> {
    const oeuvre = await tx.oeuvre.findUnique({
      where: { id: oeuvreId },
      select: {
        titre: true,
        description: true,
        technique: true,
        materiaux: true,
        dimensions: true,
        prixXOF: true,
        artisanId: true,
        categorieId: true,
      },
    });

    const dataString = JSON.stringify(oeuvre);
    return createHash('sha256').update(dataString).digest('hex');
  }

  async withdraw(id: string) {
    return this.prisma.oeuvre.update({
      where: { id },
      data: { statut: 'RETIREE' },
    });
  }

  async markSold(id: string) {
    return this.prisma.oeuvre.update({
      where: { id },
      data: { statut: 'VENDUE' },
    });
  }

  async delete(id: string) {
    return this.prisma.oeuvre.delete({ where: { id } });
  }

  async countLignesCommande(oeuvreId: string) {
    return this.prisma.ligneCommande.count({ where: { oeuvreId } });
  }

  async countMedias(oeuvreId: string, type?: MediaType) {
    return this.prisma.media.count({
      where: { oeuvreId, ...(type ? { type } : {}) },
    });
  }

  async findMediaById(mediaId: string) {
    return this.prisma.media.findUnique({ where: { id: mediaId } });
  }

  async createMedia(data: {
    url: string;
    publicId: string;
    mimeType: string;
    size: number;
    width?: number;
    height?: number;
    ordre: number;
    type?: MediaType;
    oeuvreId: string;
  }) {
    return this.prisma.media.create({ data });
  }

  async deleteMedia(mediaId: string) {
    return this.prisma.media.delete({ where: { id: mediaId } });
  }

  async reorderMedias(oeuvreId: string, mediaIds: string[]) {
    return this.prisma.$transaction(async (tx) => {
      const updates = mediaIds.map((mediaId, index) =>
        tx.media.update({
          where: { id: mediaId, oeuvreId },
          data: { ordre: index },
        })
      );
      return Promise.all(updates);
    });
  }

  async getMediasByOeuvreId(oeuvreId: string) {
    return this.prisma.media.findMany({
      where: { oeuvreId },
      orderBy: { ordre: 'asc' },
    });
  }

  async invalidateCertificat(oeuvreId: string) {
    const certificat = await this.prisma.certificat.findUnique({
      where: { oeuvreId },
    });
    if (certificat) {
      return this.prisma.certificat.update({
        where: { oeuvreId },
        data: { estValide: false },
      });
    }
    return null;
  }

  async findArtisanProfileByUserId(userId: string) {
    return this.prisma.artisanProfile.findUnique({
      where: { userId },
    });
  }

  async findAdminProfileByUserId(userId: string) {
    return this.prisma.adminProfile.findUnique({
      where: { userId },
    });
  }

  async findCategorieById(id: string) {
    return this.prisma.categorie.findUnique({ where: { id } });
  }

  async findKycValidForUser(userId: string) {
    return this.prisma.kyc.findFirst({
      where: {
        userId,
        status: 'VALIDE',
      },
    });
  }

  async findArtisanProfileById(id: string) {
    return this.prisma.artisanProfile.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, role: true, statut: true },
        },
      },
    });
  }

  async setPhotoAtelier(
    artisanProfileId: string,
    data: {
      url: string;
      publicId: string;
      mimeType: string;
      size: number;
    }
  ) {
    return this.prisma.artisanProfile.update({
      where: { id: artisanProfileId },
      data: {
        photoAtelierUrl: data.url,
        photoAtelierPublicId: data.publicId,
        photoAtelierMimeType: data.mimeType,
        photoAtelierSize: data.size,
      },
    });
  }
}
