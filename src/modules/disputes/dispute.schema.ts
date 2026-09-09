import { z } from 'zod';

const uuidParam = z.string().uuid('Invalid id');
const pageSchema = z.coerce.number().int().min(1).default(1);
const limitSchema = z.coerce.number().int().min(1).max(50).default(20);

const dateQuery = z.coerce.date();

export const disputeQuerySchema = z
  .object({
    page: pageSchema,
    limit: limitSchema,
    q: z.string().trim().max(255).optional(),
    statut: z.enum(['OUVERT', 'EN_COURS', 'RESOLU']).optional(),
    commandeId: uuidParam.optional(),
    clientId: uuidParam.optional(),
    artisanId: uuidParam.optional(),
    dateDebut: dateQuery.optional(),
    dateFin: dateQuery.optional(),
  })
  .refine((data) => !data.dateDebut || !data.dateFin || data.dateDebut <= data.dateFin, {
    message: 'dateDebut must be before dateFin',
    path: ['dateDebut'],
  });

export const disputeIdParamsSchema = z.object({
  id: uuidParam,
});

export type DisputeQuery = z.infer<typeof disputeQuerySchema>;
export type DisputeIdParams = z.infer<typeof disputeIdParamsSchema>;