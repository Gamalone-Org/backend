import { z } from 'zod';

const titreSchema = z.string().trim().min(1, 'Titre is required').max(255);
const descriptionSchema = z.string().trim().min(1, 'Description is required').max(5000);
const techniqueSchema = z.string().trim().min(1, 'Technique is required').max(255);
const materiauxSchema = z.string().trim().min(1, 'Materiaux is required').max(255);
const dimensionsSchema = z.string().trim().min(1, 'Dimensions is required').max(255);
const anneeCreationSchema = z
  .number()
  .int()
  .min(1000, 'Année de création invalide')
  .max(new Date().getFullYear() + 1, 'Année de création ne peut pas être dans le futur');
const prixXofSchema = z.number().positive('Le prix doit être positif').max(999_999_999_999);
const poidsSchema = z.number().positive('Le poids doit être positif').max(99999.99).optional();
const categorieIdSchema = z.string().uuid('Invalid category id');
const pageSchema = z.coerce.number().int().min(1).default(1);
const limitSchema = z.coerce.number().int().min(1).max(50).default(20);
const uuidParam = z.string().uuid('Invalid id');

export const createOeuvreSchema = z
  .object({
    artisanId: uuidParam,
    titre: titreSchema,
    description: descriptionSchema,
    technique: techniqueSchema,
    materiaux: materiauxSchema,
    dimensions: dimensionsSchema,
    poids: poidsSchema,
    anneeCreation: anneeCreationSchema,
    prixXOF: prixXofSchema,
    categorieId: categorieIdSchema,
  })
  .strict();

export const updateOeuvreSchema = z
  .object({
    titre: titreSchema.optional(),
    description: descriptionSchema.optional(),
    technique: techniqueSchema.optional(),
    materiaux: materiauxSchema.optional(),
    dimensions: dimensionsSchema.optional(),
    poids: poidsSchema,
    anneeCreation: anneeCreationSchema.optional(),
    prixXOF: prixXofSchema.optional(),
    categorieId: categorieIdSchema.optional(),
    estMiseEnAvant: z.boolean().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'At least one field must be provided',
  });

export const reorderMediasSchema = z
  .object({
    mediaIds: z
      .array(uuidParam)
      .min(1, 'At least one media id is required')
      .max(10, 'Maximum 10 media ids'),
  })
  .strict();

export const oeuvreIdParamsSchema = z.object({
  id: uuidParam,
});

export const artisanOeuvreParamsSchema = z.object({
  artisanId: uuidParam,
});

export const oeuvreMediaParamsSchema = z.object({
  id: uuidParam,
  mediaId: uuidParam,
});

export const oeuvreReorderParamsSchema = z.object({
  id: uuidParam,
});

export const mediaTypeQuerySchema = z
  .enum(['OEUVRE', 'PREPARATION', 'ATELIER'])
  .default('OEUVRE');

export const publicOeuvreQuerySchema = z.object({
  page: pageSchema,
  limit: limitSchema,
  categorieId: categorieIdSchema.optional(),
  prixMin: z.coerce.number().min(0).optional(),
  prixMax: z.coerce.number().min(0).optional(),
  artisanType: z.enum(['ARTISAN', 'ARTISTE']).optional(),
  localisation: z.string().trim().max(255).optional(),
  q: z.string().trim().max(255).optional(),
  tri: z
    .enum([
      'prixXOF_asc',
      'prixXOF_desc',
      'createdAt_asc',
      'createdAt_desc',
      'anneeCreation_asc',
      'anneeCreation_desc',
    ])
    .optional()
    .default('createdAt_desc'),
});

export const artisanOeuvresQuerySchema = z.object({
  page: pageSchema,
  limit: limitSchema,
  statut: z.enum(['BROUILLON', 'EN_ATTENTE_VALIDATION', 'PUBLIEE', 'VENDUE', 'RETIREE']).optional(),
});

export const adminOeuvresQuerySchema = z.object({
  page: pageSchema,
  limit: limitSchema,
  statut: z.enum(['BROUILLON', 'EN_ATTENTE_VALIDATION', 'PUBLIEE', 'VENDUE', 'RETIREE']).optional(),
  artisanId: categorieIdSchema.optional(),
  categorieId: categorieIdSchema.optional(),
});

export const featuredQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(20).default(10),
});

export type CreateOeuvreInput = z.infer<typeof createOeuvreSchema>;
export type UpdateOeuvreInput = z.infer<typeof updateOeuvreSchema>;
export type ReorderMediasInput = z.infer<typeof reorderMediasSchema>;
export type PublicOeuvreQuery = z.infer<typeof publicOeuvreQuerySchema>;
export type ArtisanOeuvresQuery = z.infer<typeof artisanOeuvresQuerySchema>;
export type AdminOeuvresQuery = z.infer<typeof adminOeuvresQuerySchema>;
