import { z } from 'zod';
import { CategoryStatus } from '../../generated/prisma/client.js';

const CATEGORY_STATUSES = Object.values(CategoryStatus) as [CategoryStatus, ...CategoryStatus[]];

const nomSchema = z.string().trim().min(1, 'Nom requis').max(255);
const descriptionSchema = z.string().trim().max(2000);
const statutSchema = z.enum(CATEGORY_STATUSES);
const positionSchema = z.number().int().min(0).max(1_000_000);

export const createCategorieSchema = z
  .object({
    nom: nomSchema,
    description: descriptionSchema.default(''),
    statut: statutSchema.optional(),
    position: positionSchema.optional(),
  })
  .strict();

export const updateCategorieSchema = z
  .object({
    nom: nomSchema.optional(),
    description: descriptionSchema.optional(),
    statut: statutSchema.optional(),
    position: positionSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Au moins un champ (nom, description, statut ou position) doit être fourni',
  });

export const createSousCategorieSchema = z
  .object({
    nom: nomSchema,
    description: descriptionSchema.default(''),
    statut: statutSchema.optional(),
    position: positionSchema.optional(),
  })
  .strict();

export const updateSousCategorieSchema = z
  .object({
    nom: nomSchema.optional(),
    description: descriptionSchema.optional(),
    statut: statutSchema.optional(),
    position: positionSchema.optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Au moins un champ (nom, description, statut ou position) doit être fourni',
  });

export const categorieIdParamsSchema = z.object({
  id: z.string().uuid('Identifiant de catégorie invalide'),
});

export const categorieParamsSchema = z.object({
  categorieId: z.string().uuid('Identifiant de catégorie invalide'),
});

export const sousCategorieIdParamsSchema = z.object({
  categorieId: z.string().uuid('Identifiant de catégorie invalide'),
  sousCategorieId: z.string().uuid('Identifiant de sous-catégorie invalide'),
});

const pageSchema = z.coerce.number().int().min(1).default(1);
const limitSchema = z.coerce.number().int().min(1).max(100).default(20);

export const listCategoriesQuerySchema = z
  .object({
    page: pageSchema,
    limit: limitSchema,
    statut: statutSchema.optional(),
    q: z.string().trim().max(255).optional(),
  })
  .strict();

export type CreateCategorieInput = z.infer<typeof createCategorieSchema>;
export type UpdateCategorieInput = z.infer<typeof updateCategorieSchema>;
export type CreateSousCategorieInput = z.infer<typeof createSousCategorieSchema>;
export type UpdateSousCategorieInput = z.infer<typeof updateSousCategorieSchema>;
export type ListCategoriesQuery = z.infer<typeof listCategoriesQuerySchema>;
