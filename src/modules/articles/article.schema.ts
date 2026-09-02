import { z } from 'zod';
import { ArticleStatus } from '../../generated/prisma/client.js';

const ARTICLE_STATUSES = Object.values(ArticleStatus) as [ArticleStatus, ...ArticleStatus[]];

const titreSchema = z.string().trim().min(1, 'Titre requis').max(255);
const contenuSchema = z.string().trim().min(1, 'Contenu requis');
const metaDescriptionSchema = z.string().trim().max(500);
const slugSchema = z.string().trim().min(1).max(200);

export const createArticleSchema = z
  .object({
    titre: titreSchema,
    contenu: contenuSchema,
    metaDescription: metaDescriptionSchema.optional(),
    categorieId: z.string().uuid('Identifiant de catégorie invalide'),
  })
  .strict();

export const updateArticleSchema = z
  .object({
    titre: titreSchema.optional(),
    contenu: contenuSchema.optional(),
    metaDescription: metaDescriptionSchema.optional(),
    categorieId: z.string().uuid('Identifiant de catégorie invalide').optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Au moins un champ (titre, contenu, metaDescription ou categorieId) doit être fourni',
  });

export const scheduleArticleSchema = z
  .object({
    datePlanification: z
      .string()
      .datetime('Date de planification invalide (format ISO 8601 attendu)'),
  })
  .strict();

export const articleIdParamsSchema = z.object({
  id: z.string().uuid('Identifiant d\u2019article invalide'),
});

const pageSchema = z.coerce.number().int().min(1).default(1);
const limitSchema = z.coerce.number().int().min(1).max(100).default(20);

export const listArticlesQuerySchema = z
  .object({
    page: pageSchema,
    limit: limitSchema,
    statut: z.enum(ARTICLE_STATUSES).optional(),
    categorieId: z.string().uuid('Identifiant de catégorie invalide').optional(),
    q: z.string().trim().max(255).optional(),
    tri: z.enum(['recent', 'plus_ancien', 'titre']).optional(),
  })
  .strict();

export type CreateArticleInput = z.infer<typeof createArticleSchema>;
export type UpdateArticleInput = z.infer<typeof updateArticleSchema>;
export type ScheduleArticleInput = z.infer<typeof scheduleArticleSchema>;
export type ListArticlesQuery = z.infer<typeof listArticlesQuerySchema>;
export type ArticleStatusType = z.infer<typeof listArticlesQuerySchema>['statut'];

export { slugSchema as articleSlugSchema };
