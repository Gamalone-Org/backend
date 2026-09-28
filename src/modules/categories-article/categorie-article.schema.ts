import { z } from 'zod';
import { CategoryStatus } from '../../generated/prisma/client.js';

const CATEGORY_STATUSES = Object.values(CategoryStatus) as [CategoryStatus, ...CategoryStatus[]];

const nomSchema = z.string().trim().min(1, 'Nom requis').max(255);
const descriptionSchema = z.string().trim().max(2000);
const statutSchema = z.enum(CATEGORY_STATUSES);

/**
 * Catégories des articles / blog.
 *
 * Volontairement distinct de `categorie.schema.ts` (catégories d'œuvres) :
 * aucun `position`, aucune sous-catégorie, aucun export CSV. Le contrat
 * retenu reste aligné sur le module catégories pour le reste
 * (nom / description / statut + gestion d'image de couverture).
 */
export const createCategorieArticleSchema = z
  .object({
    nom: nomSchema,
    description: descriptionSchema.default(''),
    statut: statutSchema.optional(),
  })
  .strict();

export const updateCategorieArticleSchema = z
  .object({
    nom: nomSchema.optional(),
    description: descriptionSchema.optional(),
    statut: statutSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Au moins un champ (nom, description ou statut) doit être fourni',
  });

export const categorieArticleIdParamsSchema = z.object({
  id: z.string().uuid('Identifiant de catégorie invalide'),
});

const pageSchema = z.coerce.number().int().min(1).default(1);
const limitSchema = z.coerce.number().int().min(1).max(100).default(20);

export const listCategoriesArticleQuerySchema = z
  .object({
    page: pageSchema,
    limit: limitSchema,
    statut: statutSchema.optional(),
    q: z.string().trim().max(255).optional(),
  })
  .strict();

export type CreateCategorieArticleInput = z.infer<typeof createCategorieArticleSchema>;
export type UpdateCategorieArticleInput = z.infer<typeof updateCategorieArticleSchema>;
export type ListCategoriesArticleQuery = z.infer<typeof listCategoriesArticleQuerySchema>;
