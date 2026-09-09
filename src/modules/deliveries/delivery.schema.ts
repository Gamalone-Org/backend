import { z } from 'zod';
import { DeliveryStatus } from '../../generated/prisma/client.js';

const DELIVERY_STATUSES = Object.values(DeliveryStatus) as [
  DeliveryStatus,
  ...DeliveryStatus[]
];

const uuidParam = z.string().uuid('Invalid id');
const pageSchema = z.coerce.number().int().min(1).default(1);
const limitSchema = z.coerce.number().int().min(1).max(50).default(20);

const transporteurSchema = z
  .string()
  .trim()
  .min(1, 'Transporteur requis')
  .max(255);

const numeroSuiviSchema = z
  .string()
  .trim()
  .min(1, 'Numéro de suivi requis')
  .max(255);

export const deliveryQuerySchema = z.object({
  page: pageSchema,
  limit: limitSchema,
  statut: z.enum(DELIVERY_STATUSES).optional(),
  q: z.string().trim().max(255).optional(),
});

export const deliveryIdParamsSchema = z.object({
  id: uuidParam,
});

export const updateDeliverySchema = z
  .object({
    transporteur: transporteurSchema.optional(),
    numeroSuivi: numeroSuiviSchema.optional(),
  })
  .strict()
  .refine(
    (data) => data.transporteur !== undefined || data.numeroSuivi !== undefined,
    { message: 'Au moins un champ doit être fourni' }
  );

export const updateDeliveryStatutSchema = z
  .object({
    statut: z.enum(DELIVERY_STATUSES),
  })
  .strict();

export type DeliveryQuery = z.infer<typeof deliveryQuerySchema>;
export type DeliveryIdParams = z.infer<typeof deliveryIdParamsSchema>;
export type UpdateDeliveryInput = z.infer<typeof updateDeliverySchema>;
export type UpdateDeliveryStatutInput = z.infer<typeof updateDeliveryStatutSchema>;