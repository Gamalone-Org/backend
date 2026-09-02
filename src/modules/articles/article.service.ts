import { ArticleRepository, type ListArticlesOptions } from './article.repository.js';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/AppError.js';
import type {
  CreateArticleInput,
  UpdateArticleInput,
  ScheduleArticleInput,
} from './article.schema.js';
import type { CloudinaryUploadInput, CloudinaryUploadOptions } from '../../shared/services/cloudinary/index.js';
import { uniqueSlug } from '../categories/slug.util.js';

const IMAGE_DOMAIN = 'articles' as const;
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const EDITABLE_STATUSES = new Set(['BROUILLON', 'PLANIFIE']);

export class ArticleService {
  constructor(private readonly repository: ArticleRepository) {}

  // --- Article ---

  async createArticle(adminUserId: string, input: CreateArticleInput) {
    await this.assertCategorieActive(input.categorieId);
    const adminProfile = await this.repository.findAdminProfileIdByUserId(adminUserId);
    if (!adminProfile) {
      throw new ConflictError('Profil admin non trouvé');
    }
    const titre = input.titre.trim();
    const slug = await uniqueSlug(titre, (s) =>
      this.repository.findArticleBySlug(s).then((r) => r !== null)
    );
    return this.repository.createArticle({
      titre,
      contenu: input.contenu,
      slug,
      categorieId: input.categorieId,
      auteurId: adminProfile.id,
      ...(input.metaDescription !== undefined ? { metaDescription: input.metaDescription } : {}),
    });
  }

  async updateArticle(id: string, input: UpdateArticleInput) {
    const article = await this.assertEditableArticleExists(id);
    if (input.categorieId) {
      await this.assertCategorieActive(input.categorieId);
    }
    const data: {
      titre?: string;
      contenu?: string;
      slug?: string;
      metaDescription?: string | null;
      categorieId?: string;
    } = {};
    if (input.titre !== undefined) {
      const titre = input.titre.trim();
      data.titre = titre;
      data.slug = await this.regenerateSlug(titre, article.slug);
    }
    if (input.contenu !== undefined) data.contenu = input.contenu;
    if (input.metaDescription !== undefined) data.metaDescription = input.metaDescription;
    if (input.categorieId !== undefined) data.categorieId = input.categorieId;
    return this.repository.updateArticle(id, data);
  }

  async publishArticle(adminUserId: string, id: string) {
    const article = await this.assertArticleExists(id);
    if (article.statut === 'PUBLIE') {
      throw new ConflictError('L\u2019article est déjà publié');
    }
    if (article.statut !== 'BROUILLON' && article.statut !== 'PLANIFIE') {
      throw new ConflictError('Transition de statut non autorisée');
    }
    const adminProfile = await this.repository.findAdminProfileIdByUserId(adminUserId);
    if (!adminProfile) {
      throw new ConflictError('Profil admin non trouvé');
    }
    return this.repository.updateArticle(id, {
      statut: 'PUBLIE',
      datePublication: new Date(),
      datePlanification: null,
      publishedByAdminId: adminProfile.id,
    });
  }

  async scheduleArticle(id: string, input: ScheduleArticleInput) {
    const article = await this.assertArticleExists(id);
    if (article.statut !== 'BROUILLON') {
      throw new ConflictError(
        'Seuls les articles en brouillon peuvent être planifiés'
      );
    }
    const datePlanification = new Date(input.datePlanification);
    if (Number.isNaN(datePlanification.getTime())) {
      throw new ValidationError('Date de planification invalide');
    }
    return this.repository.updateArticle(id, {
      statut: 'PLANIFIE',
      datePlanification,
    });
  }

  async unpublishArticle(id: string) {
    const article = await this.assertArticleExists(id);
    if (article.statut === 'BROUILLON') {
      throw new ConflictError('L\u2019article est déjà en brouillon');
    }
    if (article.statut !== 'PLANIFIE' && article.statut !== 'PUBLIE') {
      throw new ConflictError('Transition de statut non autorisée');
    }
    return this.repository.updateArticle(id, {
      statut: 'BROUILLON',
      datePublication: null,
      datePlanification: null,
    });
  }

  async deleteArticle(id: string) {
    const article = await this.assertArticleExists(id);
    const deleted = await this.repository.softDeleteArticle(id);
    if (article.imageCouverturePublicId) {
      await this.repository.deleteImage(article.imageCouverturePublicId).catch(() => undefined);
    }
    return deleted;
  }

  async getArticle(id: string) {
    const article = await this.repository.findArticleById(id);
    if (!article) {
      throw new NotFoundError('Article non trouvé');
    }
    return article;
  }

  async uploadArticleCover(id: string, file: CloudinaryUploadInput, options: CloudinaryUploadOptions) {
    const article = await this.assertArticleExists(id);
    this.assertAllowedMimeType(options.mimeType);
    const image = await this.repository.uploadImage(file, { ...options, domain: IMAGE_DOMAIN });
    if (article.imageCouverturePublicId) {
      await this.repository.deleteImage(article.imageCouverturePublicId).catch(() => undefined);
    }
    return this.repository.updateArticle(id, image);
  }

  async deleteArticleCover(id: string) {
    const article = await this.assertArticleExists(id);
    if (!article.imageCouverturePublicId) {
      throw new NotFoundError('Image de couverture non définie');
    }
    await this.repository.deleteImage(article.imageCouverturePublicId);
    return this.repository.updateArticle(id, {
      imageCouvertureUrl: null,
      imageCouverturePublicId: null,
    });
  }

  listArticles(options: ListArticlesOptions) {
    return this.repository.listArticles(options);
  }

  // --- private ---

  private async regenerateSlug(titre: string, currentSlug: string): Promise<string> {
    const slug = await uniqueSlug(titre, (s) => {
      if (currentSlug === s) return Promise.resolve(false);
      return this.repository.findArticleBySlug(s).then((r) => r !== null);
    });
    return slug;
  }

  private async assertCategorieActive(id: string): Promise<void> {
    const categorie = await this.repository.findCategorieById(id);
    if (!categorie) {
      throw new NotFoundError('Catégorie non trouvée');
    }
    if (categorie.statut !== 'ACTIVE') {
      throw new ValidationError(
        'La catégorie est inactive et ne peut pas être utilisée'
      );
    }
  }

  private async assertArticleExists(id: string) {
    const article = await this.repository.findArticleById(id);
    if (!article) {
      throw new NotFoundError('Article non trouvé');
    }
    return article;
  }

  private async assertEditableArticleExists(id: string) {
    const article = await this.assertArticleExists(id);
    if (!EDITABLE_STATUSES.has(article.statut)) {
      throw new ConflictError('Seuls les articles non publiés peuvent être modifiés');
    }
    return article;
  }

  private assertAllowedMimeType(mimeType: string) {
    if (!IMAGE_MIME_TYPES.has(mimeType)) {
      throw new ValidationError('Format d\u2019image non autorisé. Formats acceptés : JPEG, PNG, WEBP');
    }
  }
}
