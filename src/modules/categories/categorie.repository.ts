import type { Prisma, PrismaClient, CategoryStatus } from '../../generated/prisma/client.js';
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

export type ListCategoriesOptions = {
  page: number;
  limit: number;
  statut?: CategoryStatus;
  q?: string;
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
    const where: Prisma.CategorieWhereInput = {
      ...(options.statut ? { statut: options.statut } : {}),
      ...(options.q ? { nom: { contains: options.q, mode: 'insensitive' } } : {}),
    };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.categorie.count({ where }),
      this.prisma.categorie.findMany({
        where,
        orderBy: [{ position: 'asc' }, { nom: 'asc' }],
        skip: (options.page - 1) * options.limit,
        take: options.limit,
        include: { sousCategories: { orderBy: [{ position: 'asc' }, { nom: 'asc' }] } },
      }),
    ]);

    return { items, total, page: options.page, limit: options.limit };
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

  listSousCategoriesByCategorie(categorieId: string) {
    return this.prisma.sousCategorie.findMany({
      where: { categorieId },
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
}
