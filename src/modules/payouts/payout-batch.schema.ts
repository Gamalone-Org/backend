import { z } from 'zod';

const uuid = z.string().uuid('Invalid id');

export const payoutBatchPrepareSchema = z.object({
  artisanId: uuid,
  commandeArtisanIds: z.array(uuid).min(1).max(200),
});

export const payoutBatchConfirmSchema = z.object({
  moyenPaiement: z.enum(['MOBILE_MONEY', 'VIREMENT_BANCAIRE']),
  referenceTransfert: z
    .string()
    .trim()
    .min(3, 'La référence de transfert est requise')
    .max(255, 'Référence trop longue'),
  dateConfirmation: z.coerce.date().optional(),
  note: z.string().trim().max(1000).optional(),
});

export const payoutBatchCancelSchema = z.object({
  motifAnnulation: z
    .string()
    .trim()
    .min(5, 'Le motif est requis')
    .max(1000, 'Motif trop long'),
});

export const payoutBatchIdParamsSchema = z.object({
  id: uuid,
});

export const payoutBatchListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  artisanId: uuid.optional(),
  statut: z.enum(['EN_ATTENTE', 'VERSE', 'ANNULE']).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export const payoutBatchEligibleQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  artisanId: uuid.optional(),
});

export type PayoutBatchPrepareInput = z.infer<typeof payoutBatchPrepareSchema>;
export type PayoutBatchConfirmInput = z.infer<typeof payoutBatchConfirmSchema>;
export type PayoutBatchCancelInput = z.infer<typeof payoutBatchCancelSchema>;
export type PayoutBatchIdParams = z.infer<typeof payoutBatchIdParamsSchema>;
export type PayoutBatchListQuery = z.infer<typeof payoutBatchListQuerySchema>;
export type PayoutBatchEligibleQuery = z.infer<typeof payoutBatchEligibleQuerySchema>;
