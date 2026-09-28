import type { Prisma, PrismaClient, CategoryStatus } from '../../generated/prisma/client.js';
import type { CloudinaryService } from '../../shared/services/cloudinary/index.js';
import type {
  CloudinaryUploadInput,
  CloudinaryUploadOptions,
} from '../../shared/services/cloudinary/index.js';

type CategorieArticleData = {
  nom: string;
  description: string;
  slug: string;
  statut?: CategoryStatus;
  imageCouvertureUrl?: string | null;
  imageCouverturePublicId?: string | null;
};

type CategorieArticleUpdateData = {
  nom?: string;
  description?: string;
  slug?: string;
  statut?: CategoryStatus;
  imageCouvertureUrl?: string | null;
  imageCouverturePublicId?: string | null;
};

export type CategorieArticleFilters = {
  statut?: CategoryStatus;
  q?: string;
};

export type ListCategoriesArticleOptions = CategorieArticleFilters & {
  page: number;
  limit: number;
};

/**
 * Accès à la table `categories_articles`.
 *
 * Aucun appel à `prisma.categorie` ici : les catégories d'articles et les
 * catégories d'œuvres sont deux systèmes cloisonnés. Le seul point de
 * contact est le `categorieId` de l'article, consommé côté `articles`.
 */
export class CategorieArticleRepository {
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

  createCategorieArticle(data: CategorieArticleData) {
    return this.prisma.categorieArticle.create({ data });
  }

  updateCategorieArticle(id: string, data: CategorieArticleUpdateData) {
    return this.prisma.categorieArticle.update({ where: { id }, data });
  }

  deleteCategorieArticle(id: string) {
    return this.prisma.categorieArticle.delete({ where: { id } });
  }

  findCategorieArticleById(id: string) {
    return this.prisma.categorieArticle.findUnique({
      where: { id },
      include: { _count: { select: { articles: true } } },
    });
  }

  findCategorieArticleByNom(nom: string) {
    return this.prisma.categorieArticle.findUnique({ where: { nom } });
  }

  findCategorieArticleBySlug(slug: string) {
    return this.prisma.categorieArticle.findUnique({ where: { slug } });
  }

  countArticlesByCategorieArticle(id: string) {
    return this.prisma.article.count({ where: { categorieId: id } });
  }

  async listCategoriesArticle(options: ListCategoriesArticleOptions) {
    const where = this.buildWhere(options);

    const [total, items] = await this.prisma.$transaction([
      this.prisma.categorieArticle.count({ where }),
      this.prisma.categorieArticle.findMany({
        where,
        orderBy: [{ nom: 'asc' }],
        skip: (options.page - 1) * options.limit,
        take: options.limit,
        include: { _count: { select: { articles: true } } },
      }),
    ]);

    return { items, total, page: options.page, limit: options.limit };
  }

  private buildWhere(options: CategorieArticleFilters): Prisma.CategorieArticleWhereInput {
    return {
      ...(options.statut ? { statut: options.statut } : {}),
      ...(options.q ? { nom: { contains: options.q, mode: 'insensitive' } } : {}),
    };
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
