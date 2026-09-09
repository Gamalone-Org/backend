import { z } from 'zod';

const uuidParam = z.string().uuid('Invalid id');
const pageSchema = z.coerce.number().int().min(1).default(1);
const limitSchema = z.coerce.number().int().min(1).max(50).default(20);

const booleanQuery = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

const dateQuery = z.coerce.date();

export const reviewQuerySchema = z
  .object({
    page: pageSchema,
    limit: limitSchema,
    q: z.string().trim().max(255).optional(),
    note: z.coerce.number().int().min(1).max(5).optional(),
    estVerifie: booleanQuery.optional(),
    dateDebut: dateQuery.optional(),
    dateFin: dateQuery.optional(),
    commandeId: uuidParam.optional(),
    auteurId: uuidParam.optional(),
    oeuvreId: uuidParam.optional(),
    artisanId: uuidParam.optional(),
  })
  .refine((data) => !data.dateDebut || !data.dateFin || data.dateDebut <= data.dateFin, {
    message: 'dateDebut must be before dateFin',
    path: ['dateDebut'],
  });

export const reviewIdParamsSchema = z.object({
  id: uuidParam,
});

export type ReviewQuery = z.infer<typeof reviewQuerySchema>;
export type ReviewIdParams = z.infer<typeof reviewIdParamsSchema>;