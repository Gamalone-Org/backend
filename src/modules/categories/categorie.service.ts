import { Prisma } from '../../generated/prisma/client.js';
import { CategorieRepository, type ListCategoriesOptions } from './categorie.repository.js';
import {
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/AppError.js';
import type {
  CreateCategorieInput,
  CreateSousCategorieInput,
  UpdateCategorieInput,
  UpdateSousCategorieInput,
} from './categorie.schema.js';
import type { CloudinaryUploadInput, CloudinaryUploadOptions } from '../../shared/services/cloudinary/index.js';
import { uniqueSlug } from './slug.util.js';

const IMAGE_DOMAIN = 'media' as const;
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

export class CategorieService {
  constructor(private readonly repository: CategorieRepository) {}

  async createCategorie(input: CreateCategorieInput) {
    const nom = input.nom.trim();
    const existing = await this.repository.findCategorieByNom(nom);
    if (existing) {
      throw new ConflictError('Une catégorie avec ce nom existe déjà');
    }
    const slug = await uniqueSlug(nom, (s) =>
      this.repository.findCategorieBySlug(s).then((r) => r !== null)
    );
    return this.repository.createCategorie({
      nom,
      description: input.description,
      slug,
      ...(input.statut !== undefined ? { statut: input.statut } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
    });
  }

  async updateCategorie(id: string, input: UpdateCategorieInput) {
    await this.assertCategorieExists(id);
    if (input.nom !== undefined) {
      const nom = input.nom.trim();
      const duplicate = await this.repository.findCategorieByNom(nom);
      if (duplicate && duplicate.id !== id) {
        throw new ConflictError('Une catégorie avec ce nom existe déjà');
      }
      const current = await this.repository.findCategorieById(id);
      const slug = await uniqueSlug(nom, (s) => {
        if (current && current.slug === s) return Promise.resolve(false);
        return this.repository.findCategorieBySlug(s).then((r) => r !== null);
      });
      try {
        return await this.repository.updateCategorie(id, {
          nom,
          slug,
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.statut !== undefined ? { statut: input.statut } : {}),
          ...(input.position !== undefined ? { position: input.position } : {}),
        });
      } catch (error) {
        throw this.mapConstraintError(error, 'catégorie');
      }
    }
    try {
      return await this.repository.updateCategorie(id, {
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.statut !== undefined ? { statut: input.statut } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
      });
    } catch (error) {
      throw this.mapConstraintError(error, 'catégorie');
    }
  }

  async deleteCategorie(id: string) {
    const existing = await this.repository.findCategorieById(id);
    if (!existing) {
      throw new NotFoundError('Catégorie non trouvée');
    }
    const [oeuvres, sousCategories] = await Promise.all([
      this.repository.countOeuvresByCategorie(id),
      this.repository.countSousCategoriesByCategorie(id),
    ]);
    if (oeuvres > 0 || sousCategories > 0) {
      throw new ConflictError(
        'La catégorie est encore rattachée à des œuvres ou sous-catégories et ne peut pas être supprimée'
      );
    }
    try {
      const deleted = await this.repository.deleteCategorie(id);
      if (existing.imageCouverturePublicId) {
        await this.repository.deleteImage(existing.imageCouverturePublicId).catch(() => undefined);
      }
      return deleted;
    } catch (error) {
      throw this.mapConstraintsOnDelete(error, 'catégorie');
    }
  }

  async getCategorie(id: string) {
    const categorie = await this.repository.findCategorieById(id);
    if (!categorie) {
      throw new NotFoundError('Catégorie non trouvée');
    }
    return categorie;
  }

  listCategories(options: ListCategoriesOptions) {
    return this.repository.listCategories(options);
  }

  async uploadCategorieImage(id: string, file: CloudinaryUploadInput, options: CloudinaryUploadOptions) {
    const existing = await this.repository.findCategorieById(id);
    if (!existing) {
      throw new NotFoundError('Catégorie non trouvée');
    }
    this.assertAllowedMimeType(options.mimeType);
    const image = await this.repository.uploadImage(file, { ...options, domain: IMAGE_DOMAIN });
    if (existing.imageCouverturePublicId) {
      await this.repository.deleteImage(existing.imageCouverturePublicId).catch(() => undefined);
    }
    return this.repository.updateCategorie(id, image);
  }

  async deleteCategorieImage(id: string) {
    const existing = await this.repository.findCategorieById(id);
    if (!existing) {
      throw new NotFoundError('Catégorie non trouvée');
    }
    if (!existing.imageCouverturePublicId) {
      throw new NotFoundError('Image de couverture non définie');
    }
    await this.repository.deleteImage(existing.imageCouverturePublicId);
    return this.repository.updateCategorie(id, {
      imageCouvertureUrl: null,
      imageCouverturePublicId: null,
    });
  }

  async createSousCategorie(categorieId: string, input: CreateSousCategorieInput) {
    const categorie = await this.repository.findCategorieById(categorieId);
    if (!categorie) {
      throw new NotFoundError('Catégorie parente non trouvée');
    }
    const nom = input.nom.trim();
    const duplicate = await this.repository.findSousCategorieInCategorie(categorieId, nom);
    if (duplicate) {
      throw new ConflictError('Une sous-catégorie avec ce nom existe déjà dans cette catégorie');
    }
    const slug = await uniqueSlug(nom, (s) =>
      this.repository.findSousCategorieBySlug(s).then((r) => r !== null)
    );
    return this.repository.createSousCategorie({
      nom,
      description: input.description,
      slug,
      categorieId,
      ...(input.statut !== undefined ? { statut: input.statut } : {}),
      ...(input.position !== undefined ? { position: input.position } : {}),
    });
  }

  async updateSousCategorie(id: string, input: UpdateSousCategorieInput) {
    await this.assertSousCategorieExists(id);
    if (input.nom !== undefined) {
      const nom = input.nom.trim();
      const current = await this.repository.findSousCategorieById(id);
      const slug = await uniqueSlug(nom, (s) => {
        if (current && current.slug === s) return Promise.resolve(false);
        return this.repository.findSousCategorieBySlug(s).then((r) => r !== null);
      });
      try {
        return await this.repository.updateSousCategorie(id, {
          nom,
          slug,
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.statut !== undefined ? { statut: input.statut } : {}),
          ...(input.position !== undefined ? { position: input.position } : {}),
        });
      } catch (error) {
        throw this.mapConstraintError(error, 'sous-catégorie');
      }
    }
    try {
      return await this.repository.updateSousCategorie(id, {
        ...(input.description !== undefined ? { description: input.description } : {}),
        ...(input.statut !== undefined ? { statut: input.statut } : {}),
        ...(input.position !== undefined ? { position: input.position } : {}),
      });
    } catch (error) {
      throw this.mapConstraintError(error, 'sous-catégorie');
    }
  }

  async deleteSousCategorie(id: string) {
    const existing = await this.repository.findSousCategorieById(id);
    if (!existing) {
      throw new NotFoundError('Sous-catégorie non trouvée');
    }
    try {
      const deleted = await this.repository.deleteSousCategorie(id);
      if (existing.imageCouverturePublicId) {
        await this.repository.deleteImage(existing.imageCouverturePublicId).catch(() => undefined);
      }
      return deleted;
    } catch (error) {
      throw this.mapConstraintsOnDelete(error, 'sous-catégorie');
    }
  }

  async uploadSousCategorieImage(id: string, file: CloudinaryUploadInput, options: CloudinaryUploadOptions) {
    const existing = await this.repository.findSousCategorieById(id);
    if (!existing) {
      throw new NotFoundError('Sous-catégorie non trouvée');
    }
    this.assertAllowedMimeType(options.mimeType);
    const image = await this.repository.uploadImage(file, { ...options, domain: IMAGE_DOMAIN });
    if (existing.imageCouverturePublicId) {
      await this.repository.deleteImage(existing.imageCouverturePublicId).catch(() => undefined);
    }
    return this.repository.updateSousCategorie(id, image);
  }

  async deleteSousCategorieImage(id: string) {
    const existing = await this.repository.findSousCategorieById(id);
    if (!existing) {
      throw new NotFoundError('Sous-catégorie non trouvée');
    }
    if (!existing.imageCouverturePublicId) {
      throw new NotFoundError('Image de couverture non définie');
    }
    await this.repository.deleteImage(existing.imageCouverturePublicId);
    return this.repository.updateSousCategorie(id, {
      imageCouvertureUrl: null,
      imageCouverturePublicId: null,
    });
  }

  async listSousCategoriesByCategorie(categorieId: string) {
    await this.assertCategorieExists(categorieId);
    return this.repository.listSousCategoriesByCategorie(categorieId);
  }

  private async assertCategorieExists(id: string): Promise<void> {
    const existing = await this.repository.findCategorieById(id);
    if (!existing) {
      throw new NotFoundError('Catégorie non trouvée');
    }
  }

  private async assertSousCategorieExists(id: string): Promise<void> {
    const existing = await this.repository.findSousCategorieById(id);
    if (!existing) {
      throw new NotFoundError('Sous-catégorie non trouvée');
    }
  }

  private assertAllowedMimeType(mimeType: string) {
    if (!IMAGE_MIME_TYPES.has(mimeType)) {
      throw new ValidationError('Format d\u2019image non autorisé. Formats acceptés : JPEG, PNG, WEBP');
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
        `Cette ${label} est encore référencée par d'autres enregistrements et ne peut pas être supprimée`
      );
    }
    return error instanceof Error ? error : new Error('Unexpected database error');
  }
}
