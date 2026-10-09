import { Prisma } from '../../generated/prisma/client.js';
import {
  CategorieArticleRepository,
  type ListCategoriesArticleOptions,
} from './categorie-article.repository.js';
import { ConflictError, NotFoundError, ValidationError } from '../../common/errors/AppError.js';
import type {
  CreateCategorieArticleInput,
  UpdateCategorieArticleInput,
} from './categorie-article.schema.js';
import type { CloudinaryUploadInput, CloudinaryUploadOptions } from '../../shared/services/cloudinary/index.js';
import { uniqueSlug } from '../categories/slug.util.js';

const IMAGE_DOMAIN = 'articles' as const;
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

/**
 * Service des catégories d'articles.
 *
 * Calque du service `CategorieService` (catégories d'œuvres) pour le
 * comportement demandé (création, modification, activation/désactivation,
 * suppression, image de couverture), avec deux différences :
 *   - la suppression est bloquée tant que des articles la référencent ;
 *   - aucune notion de sous-catégorie.
 */
export class CategorieArticleService {
  constructor(private readonly repository: CategorieArticleRepository) {}

  async createCategorieArticle(input: CreateCategorieArticleInput) {
    const nom = input.nom.trim();
    const existing = await this.repository.findCategorieArticleByNom(nom);
    if (existing) {
      throw new ConflictError('Une catégorie d\u2019article avec ce nom existe déjà');
    }
    const slug = await uniqueSlug(nom, (s) =>
      this.repository.findCategorieArticleBySlug(s).then((r) => r !== null)
    );
    try {
      return await this.repository.createCategorieArticle({
        nom,
        description: input.description,
        slug,
        ...(input.statut !== undefined ? { statut: input.statut } : {}),
      });
    } catch (error) {
      throw this.mapConstraintError(error, 'catégorie d\u2019article');
    }
  }

  async updateCategorieArticle(id: string, input: UpdateCategorieArticleInput) {
    await this.assertCategorieArticleExists(id);
    if (input.nom !== undefined) {
      const nom = input.nom.trim();
      const duplicate = await this.repository.findCategorieArticleByNom(nom);
      if (duplicate && duplicate.id !== id) {
        throw new ConflictError('Une catégorie d\u2019article avec ce nom existe déjà');
      }
      const current = await this.repository.findCategorieArticleById(id);
      const slug = await uniqueSlug(nom, (s) => {
        if (current && current.slug === s) return Promise.resolve(false);
        return this.repository.findCategorieArticleBySlug(s).then((r) => r !== null);
      });
      try {
        return await this.repository.updateCategorieArticle(id, {
          nom,
          slug,
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.statut !== undefined ? { statut: input.statut } : {}),
        });
      } catch (error) {
        throw this.mapConstraintError(error, 'catégorie d\u2019article');
      }
    }
    try {
      return await this.repository.updateCategorieArticle(id, {
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.statut !== undefined ? { statut: input.statut } : {}),
      });
    } catch (error) {
      throw this.mapConstraintError(error, 'catégorie d\u2019article');
    }
  }

  /**
   * Suppression selon les règles existantes du module catégories : refusée
   * tant que la catégorie est rattachée à au moins un article.
   *
   * Le compte porte sur les articles non supprimés (soft delete) : la ligne
   * `articles` existe toujours en base, la clé étrangère l'interdit aussi.
   */
  async deleteCategorieArticle(id: string) {
    const existing = await this.repository.findCategorieArticleById(id);
    if (!existing) {
      throw new NotFoundError('Catégorie d\u2019article non trouvée');
    }
    const articles = await this.repository.countArticlesByCategorieArticle(id);
    if (articles > 0) {
      throw new ConflictError(
        'La catégorie d\u2019article est encore rattachée à des articles et ne peut pas être supprimée'
      );
    }
    try {
      const deleted = await this.repository.deleteCategorieArticle(id);
      if (existing.imageCouverturePublicId) {
        await this.repository.deleteImage(existing.imageCouverturePublicId).catch(() => undefined);
      }
      return deleted;
    } catch (error) {
      throw this.mapConstraintsOnDelete(error, 'catégorie d\u2019article');
    }
  }

  async getCategorieArticle(id: string) {
    const categorie = await this.repository.findCategorieArticleById(id);
    if (!categorie) {
      throw new NotFoundError('Catégorie d\u2019article non trouvée');
    }
    return categorie;
  }

  async listCategoriesArticle(options: ListCategoriesArticleOptions) {
    const result = await this.repository.listCategoriesArticle(options);
    const totalPages = result.total === 0 ? 0 : Math.ceil(result.total / result.limit);
    return { ...result, totalPages };
  }

  // --- Consultation publique : uniquement les catégories ACTIVE ---

  async listPublicCategoriesArticle(options: ListCategoriesArticleOptions) {
    const result = await this.repository.listPublicCategoriesArticle(options);
    const totalPages = result.total === 0 ? 0 : Math.ceil(result.total / result.limit);
    return { ...result, totalPages };
  }

  async uploadCategorieArticleImage(
    id: string,
    file: CloudinaryUploadInput,
    options: CloudinaryUploadOptions
  ) {
    const existing = await this.repository.findCategorieArticleById(id);
    if (!existing) {
      throw new NotFoundError('Catégorie d\u2019article non trouvée');
    }
    this.assertAllowedMimeType(options.mimeType);
    const image = await this.repository.uploadImage(file, { ...options, domain: IMAGE_DOMAIN });
    if (existing.imageCouverturePublicId) {
      await this.repository.deleteImage(existing.imageCouverturePublicId).catch(() => undefined);
    }
    return this.repository.updateCategorieArticle(id, image);
  }

  async deleteCategorieArticleImage(id: string) {
    const existing = await this.repository.findCategorieArticleById(id);
    if (!existing) {
      throw new NotFoundError('Catégorie d\u2019article non trouvée');
    }
    if (!existing.imageCouverturePublicId) {
      throw new NotFoundError('Image de couverture non définie');
    }
    await this.repository.deleteImage(existing.imageCouverturePublicId);
    return this.repository.updateCategorieArticle(id, {
      imageCouvertureUrl: null,
      imageCouverturePublicId: null,
    });
  }

  private async assertCategorieArticleExists(id: string): Promise<void> {
    const existing = await this.repository.findCategorieArticleById(id);
    if (!existing) {
      throw new NotFoundError('Catégorie d\u2019article non trouvée');
    }
  }

private assertAllowedMimeType(mimeType: string) {
    if (!IMAGE_MIME_TYPES.has(mimeType)) {
      throw new ValidationError('Format d\u2019image non autoris\u00E9. Formats accept\u00E9s : JPEG, PNG, WEBP');
    }
  }

  private mapConstraintError(error: unknown, label: string): Error {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return new ConflictError(`Une ${label} avec ce nom existe déjà`);
    }
    return error instanceof Error ? error : new Error('Unexpected database error');
  }

  private mapConstraintsOnDelete(error: unknown, label: string): Error {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      return new ConflictError(
        `Cette ${label} est encore référencée par d\u2019autres enregistrements et ne peut pas être supprimée`
      );
    }
    return error instanceof Error ? error : new Error('Unexpected database error');
  }
}
