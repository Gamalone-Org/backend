import { z } from 'zod';
import { PaymentStatus } from '../../generated/prisma/client.js';

const PAYMENT_STATUSES = Object.values(PaymentStatus) as [
  PaymentStatus,
  ...PaymentStatus[],
];

const uuidParam = z.string().uuid('Invalid id');
const pageSchema = z.coerce.number().int().min(1).default(1);
const limitSchema = z.coerce.number().int().min(1).max(50).default(20);

const booleanQuerySchema = z
  .enum(['true', 'false'])
  .transform((value) => value === 'true');

export const paymentAdminQuerySchema = z.object({
  page: pageSchema,
  limit: limitSchema,
  statut: z.enum(PAYMENT_STATUSES).optional(),
  reconciliationRequise: booleanQuerySchema.optional(),
  q: z.string().trim().max(255).optional(),
  dateFrom: z.coerce.date().optional(),
  dateTo: z.coerce.date().optional(),
});

export const paymentAdminIdParamsSchema = z.object({
  id: uuidParam,
});

export type PaymentAdminQuery = z.infer<typeof paymentAdminQuerySchema>;
export type PaymentAdminIdParams = z.infer<typeof paymentAdminIdParamsSchema>;
