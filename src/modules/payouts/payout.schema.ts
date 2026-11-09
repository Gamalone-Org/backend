import { z } from 'zod';
import { PayoutStatus } from '../../generated/prisma/client.js';

const PAYOUT_STATUSES = Object.values(PayoutStatus) as [PayoutStatus, ...PayoutStatus[]];

const uuidParam = z.string().uuid('Invalid id');
const pageSchema = z.coerce.number().int().min(1).default(1);
const limitSchema = z.coerce.number().int().min(1).max(50).default(20);

export const payoutAdminQuerySchema = z.object({
  page: pageSchema,
  limit: limitSchema,
  statut: z.enum(PAYOUT_STATUSES).optional(),
  artisanId: z.string().uuid().optional(),
  commandeId: z.string().uuid().optional(),
  q: z.string().trim().max(255).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export const payoutIdParamsSchema = z.object({
  id: uuidParam,
});

export const payoutCommandeArtisanParamsSchema = z.object({
  commandeArtisanId: uuidParam,
});

export type PayoutAdminQuery = z.infer<typeof payoutAdminQuerySchema>;
export type PayoutIdParams = z.infer<typeof payoutIdParamsSchema>;
export type PayoutCommandeArtisanParams = z.infer<typeof payoutCommandeArtisanParamsSchema>;
