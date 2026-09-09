import type { Prisma, PrismaClient, ArticleStatus } from '../../generated/prisma/client.js';
import type { CloudinaryService } from '../../shared/services/cloudinary/index.js';
import type {
  CloudinaryUploadInput,
  CloudinaryUploadOptions,
} from '../../shared/services/cloudinary/index.js';

type ArticleData = {
  titre: string;
  contenu: string;
  slug: string;
  metaDescription?: string | null;
  categorieId: string;
  auteurId: string;
};

type ArticleUpdateData = {
  titre?: string;
  contenu?: string;
  slug?: string;
  metaDescription?: string | null;
  categorieId?: string;
  statut?: 'BROUILLON' | 'PLANIFIE' | 'PUBLIE';
  datePublication?: Date | null;
  datePlanification?: Date | null;
  publishedByAdminId?: string | null;
  imageCouvertureUrl?: string | null;
  imageCouverturePublicId?: string | null;
};

export type ListArticlesOptions = {
  page: number;
  limit: number;
  statut?: ArticleStatus;
  categorieId?: string;
  auteurId?: string;
  dateDebut?: Date;
  dateFin?: Date;
  q?: string;
  tri?: 'recent' | 'plus_ancien' | 'titre';
};

export class ArticleRepository {
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

  // --- Categorie (référence du catalogue global) ---

  findCategorieById(id: string) {
    return this.prisma.categorie.findUnique({ where: { id } });
  }

  // --- Article ---

  createArticle(data: ArticleData) {
    return this.prisma.article.create({ data });
  }

  updateArticle(id: string, data: ArticleUpdateData) {
    return this.prisma.article.update({ where: { id }, data });
  }

  softDeleteArticle(id: string) {
    return this.prisma.article.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  findArticleById(id: string) {
    return this.prisma.article.findFirst({
      where: { id, deletedAt: null },
      include: {
        categorie: true,
        auteur: { include: { user: { select: { id: true, nom: true } } } },
        publishedByAdmin: { include: { user: { select: { id: true, nom: true } } } },
      },
    });
  }

  findArticleBySlug(slug: string) {
    return this.prisma.article.findFirst({
      where: { slug, deletedAt: null },
    });
  }

  findAdminProfileIdByUserId(userId: string) {
    return this.prisma.adminProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
  }

  async listArticles(options: ListArticlesOptions) {
    const where = this.buildWhere(options);

    const orderBy: Prisma.ArticleOrderByWithRelationInput[] =
      options.tri === 'plus_ancien'
        ? [{ createdAt: 'asc' }]
        : options.tri === 'titre'
          ? [{ titre: 'asc' }]
          : [{ createdAt: 'desc' }];

    const [total, items] = await this.prisma.$transaction([
      this.prisma.article.count({ where }),
      this.prisma.article.findMany({
        where,
        orderBy,
        skip: (options.page - 1) * options.limit,
        take: options.limit,
        include: {
          categorie: true,
          auteur: { include: { user: { select: { id: true, nom: true } } } },
          publishedByAdmin: { include: { user: { select: { id: true, nom: true } } } },
        },
      }),
    ]);

    return { items, total, page: options.page, limit: options.limit };
  }

  async findForExport(options: ListArticlesOptions, limit: number) {
    const where = this.buildWhere(options);

    return this.prisma.article.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }],
      take: limit,
      include: {
        categorie: true,
        auteur: { include: { user: { select: { id: true, nom: true } } } },
        publishedByAdmin: { include: { user: { select: { id: true, nom: true } } } },
      },
    });
  }

  private buildWhere(options: ListArticlesOptions): Prisma.ArticleWhereInput {
    const where: Prisma.ArticleWhereInput = { deletedAt: null };

    if (options.statut) {
      where.statut = options.statut;
    }

    if (options.categorieId) {
      where.categorieId = options.categorieId;
    }

    if (options.auteurId) {
      where.auteurId = options.auteurId;
    }

    if (options.dateDebut || options.dateFin) {
      where.createdAt = {
        ...(options.dateDebut ? { gte: options.dateDebut } : {}),
        ...(options.dateFin ? { lte: options.dateFin } : {}),
      };
    }

    if (options.q) {
      where.OR = [
        { titre: { contains: options.q, mode: 'insensitive' } },
        { contenu: { contains: options.q, mode: 'insensitive' } },
        { slug: { contains: options.q, mode: 'insensitive' } },
        { categorie: { nom: { contains: options.q, mode: 'insensitive' } } },
        { auteur: { user: { nom: { contains: options.q, mode: 'insensitive' } } } },
      ];
    }

    return where;
  }

  // --- Cloudinary ---

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
