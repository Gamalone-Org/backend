import type { Prisma, PrismaClient, CategoryStatus, ArtworkStatus } from '../../generated/prisma/client.js';
import type { CloudinaryService } from '../../shared/services/cloudinary/index.js';
import type {
  CloudinaryUploadInput,
  CloudinaryUploadOptions,
} from '../../shared/services/cloudinary/index.js';

type CategorieData = {
  nom: string;
  description: string;
  slug: string;
  statut?: CategoryStatus;
  position?: number;
  imageCouvertureUrl?: string | null;
  imageCouverturePublicId?: string | null;
};

type CategorieUpdateData = {
  nom?: string;
  description?: string;
  slug?: string;
  statut?: CategoryStatus;
  position?: number;
  imageCouvertureUrl?: string | null;
  imageCouverturePublicId?: string | null;
};

export type CategorieStats = {
  nombreOeuvres: number;
  nombreArtisans: number;
};

type SousCategorieData = {
  nom: string;
  description: string;
  slug: string;
  categorieId: string;
  statut?: CategoryStatus;
  position?: number;
  imageCouvertureUrl?: string | null;
  imageCouverturePublicId?: string | null;
};

type SousCategorieUpdateData = {
  nom?: string;
  description?: string;
  slug?: string;
  statut?: CategoryStatus;
  position?: number;
  imageCouvertureUrl?: string | null;
  imageCouverturePublicId?: string | null;
};

export type CategorieFilters = {
  statut?: CategoryStatus;
  q?: string;
};

export type ListCategoriesOptions = CategorieFilters & {
  page: number;
  limit: number;
};

export class CategorieRepository {
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

  createCategorie(data: CategorieData) {
    return this.prisma.categorie.create({ data });
  }

  updateCategorie(id: string, data: CategorieUpdateData) {
    return this.prisma.categorie.update({ where: { id }, data });
  }

  deleteCategorie(id: string) {
    return this.prisma.categorie.delete({ where: { id } });
  }

  findCategorieById(id: string) {
    return this.prisma.categorie.findUnique({
      where: { id },
      include: { _count: { select: { oeuvres: true } } },
    });
  }

  findCategorieByNom(nom: string) {
    return this.prisma.categorie.findUnique({ where: { nom } });
  }

  findCategorieBySlug(slug: string) {
    return this.prisma.categorie.findUnique({ where: { slug } });
  }

  countOeuvresByCategorie(id: string) {
    return this.prisma.oeuvre.count({ where: { categorieId: id } });
  }

  countSousCategoriesByCategorie(id: string) {
    return this.prisma.sousCategorie.count({ where: { categorieId: id } });
  }

  async listCategories(options: ListCategoriesOptions) {
    const where = this.buildWhere(options);

    const [total, items] = await this.prisma.$transaction([
      this.prisma.categorie.count({ where }),
      this.prisma.categorie.findMany({
        where,
        orderBy: [{ position: 'asc' }, { nom: 'asc' }],
        skip: (options.page - 1) * options.limit,
        take: options.limit,
        include: {
          sousCategories: { orderBy: [{ position: 'asc' }, { nom: 'asc' }] },
          _count: { select: { oeuvres: true } },
        },
      }),
    ]);

    return { items, total, page: options.page, limit: options.limit };
  }

  async findForExport(options: CategorieFilters, limit: number) {
    return this.prisma.categorie.findMany({
      where: this.buildWhere(options),
      orderBy: [{ position: 'asc' }, { nom: 'asc' }],
      take: limit,
      include: { _count: { select: { oeuvres: true } } },
    });
  }

  private buildWhere(options: CategorieFilters): Prisma.CategorieWhereInput {
    return {
      ...(options.statut ? { statut: options.statut } : {}),
      ...(options.q ? { nom: { contains: options.q, mode: 'insensitive' } } : {}),
    };
  }

  createSousCategorie(data: SousCategorieData) {
    return this.prisma.sousCategorie.create({ data });
  }

  updateSousCategorie(id: string, data: SousCategorieUpdateData) {
    return this.prisma.sousCategorie.update({ where: { id }, data });
  }

  deleteSousCategorie(id: string) {
    return this.prisma.sousCategorie.delete({ where: { id } });
  }

  findSousCategorieById(id: string) {
    return this.prisma.sousCategorie.findUnique({ where: { id } });
  }

  findSousCategorieBySlug(slug: string) {
    return this.prisma.sousCategorie.findUnique({ where: { slug } });
  }

  findSousCategorieInCategorie(categorieId: string, nom: string) {
    return this.prisma.sousCategorie.findUnique({
      where: { categorieId_nom: { categorieId, nom } },
    });
  }

  listSousCategoriesByCategorie(categorieId: string, statut?: CategoryStatus) {
    return this.prisma.sousCategorie.findMany({
      where: { categorieId, ...(statut ? { statut } : {}) },
      orderBy: [{ position: 'asc' }, { nom: 'asc' }],
    });
  }

  async uploadImage(file: CloudinaryUploadInput, options: CloudinaryUploadOptions) {
    const result = await this.cloudinary.uploadImage(file, options);
    return {
      imageCouvertureUrl: result.secureUrl,
      imageCouverturePublicId: result.publicId,
    };
  }

  async deleteImage(publicId: string) {
    await this.cloudinary.deleteAsset(publicId, 'image');
  }

  async getCategorieStats(categorieId: string): Promise<CategorieStats> {
    // nombreOeuvres : count des œuvres PUBLIEE dans cette catégorie
    const nombreOeuvres = await this.prisma.oeuvre.count({
      where: {
        categorieId,
        statut: 'PUBLIEE' as ArtworkStatus,
      },
    });

    // nombreArtisans : artisans distincts qui ont au moins une œuvre PUBLIEE dans cette catégorie
    // ET qui ont validatedAt non null (artisan accepté/validé)
    const artisansAvecOeuvresPubliees = await this.prisma.oeuvre.findMany({
      where: {
        categorieId,
        statut: 'PUBLIEE' as ArtworkStatus,
        artisan: {
          validatedAt: { not: null },
        },
      },
      select: {
        artisanId: true,
      },
      distinct: ['artisanId'],
    });

    const nombreArtisans = artisansAvecOeuvresPubliees.length;

    return { nombreOeuvres, nombreArtisans };
  }

  async getCategoriesStatsMap(categorieIds: string[]): Promise<Map<string, CategorieStats>> {
    if (categorieIds.length === 0) {
      return new Map();
    }

    // 1. Group by categorieId pour nombreOeuvres (oeuvres PUBLIEE)
    const groupByOeuvres = await this.prisma.oeuvre.groupBy({
      by: ['categorieId'],
      where: {
        categorieId: { in: categorieIds },
        statut: 'PUBLIEE' as ArtworkStatus,
      },
      _count: {
        _all: true,
      },
    });

    // 2. Artisans distincts par categorieId (oeuvres PUBLIEE et artisan.validatedAt != null)
    const oeuvresArtisans = await this.prisma.oeuvre.findMany({
      where: {
        categorieId: { in: categorieIds },
        statut: 'PUBLIEE' as ArtworkStatus,
        artisan: {
          validatedAt: { not: null },
        },
      },
      select: {
        categorieId: true,
        artisanId: true,
      },
      distinct: ['categorieId', 'artisanId'],
    });

    const statsMap = new Map<string, CategorieStats>();

    // Initialiser la map avec 0 pour toutes les catégories demandées
    for (const id of categorieIds) {
      statsMap.set(id, { nombreOeuvres: 0, nombreArtisans: 0 });
    }

    // Remplir nombreOeuvres
    for (const row of groupByOeuvres) {
      const current = statsMap.get(row.categorieId) ?? { nombreOeuvres: 0, nombreArtisans: 0 };
      current.nombreOeuvres = row._count._all;
      statsMap.set(row.categorieId, current);
    }

    // Remplir nombreArtisans (comptage distinct par categorieId)
    const artisansCountByCat = new Map<string, number>();
    for (const row of oeuvresArtisans) {
      const count = artisansCountByCat.get(row.categorieId) ?? 0;
      artisansCountByCat.set(row.categorieId, count + 1);
    }

    for (const [catId, count] of artisansCountByCat.entries()) {
      const current = statsMap.get(catId) ?? { nombreOeuvres: 0, nombreArtisans: 0 };
      current.nombreArtisans = count;
      statsMap.set(catId, current);
    }

    return statsMap;
  }

  async listCategoriesWithStats(options: ListCategoriesOptions) {
    const where = this.buildWhere(options);

    const [total, items] = await this.prisma.$transaction([
      this.prisma.categorie.count({ where }),
      this.prisma.categorie.findMany({
        where,
        orderBy: [{ position: 'asc' }, { nom: 'asc' }],
        skip: (options.page - 1) * options.limit,
        take: options.limit,
        include: {
          sousCategories: { orderBy: [{ position: 'asc' }, { nom: 'asc' }] },
        },
      }),
    ]);

    // Batching des statistiques en SEULEMENT 2 requêtes globales au lieu de 2*N
    const categorieIds = items.map((c) => c.id);
    const statsMap = await this.getCategoriesStatsMap(categorieIds);

    const itemsWithStats = items.map((categorie) => {
      const stats = statsMap.get(categorie.id) ?? { nombreOeuvres: 0, nombreArtisans: 0 };
      return { ...categorie, ...stats };
    });

    return { items: itemsWithStats, total, page: options.page, limit: options.limit };
  }
}
