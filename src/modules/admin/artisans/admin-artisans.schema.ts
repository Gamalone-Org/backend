import { z } from 'zod';
import {
  ArtworkStatus,
  KycStatus,
  OrderStatus,
  UserStatus,
} from '../../../generated/prisma/client.js';

const KYC_STATUSES = Object.values(KycStatus) as [KycStatus, ...KycStatus[]];
const ACCOUNT_STATUSES = Object.values(UserStatus) as [UserStatus, ...UserStatus[]];
const ARTWORK_STATUSES = Object.values(ArtworkStatus) as [ArtworkStatus, ...ArtworkStatus[]];
const ORDER_STATUSES = Object.values(OrderStatus) as [OrderStatus, ...OrderStatus[]];

const pageSchema = z.coerce.number().int().min(1).default(1);
const limitSchema = z.coerce.number().int().min(1).max(100).default(20);

export const artisanParamsSchema = z
  .object({
    id: z.uuid({ message: 'Identifiant artisan invalide' }),
  })
  .strict();

export const listArtisansQuerySchema = z
  .object({
    page: pageSchema,
    limit: limitSchema,
    q: z.string().trim().max(255).optional(),
    kycStatus: z.enum(KYC_STATUSES, { message: 'Statut KYC invalide' }).optional(),
    kycPending: z
      .enum(['true', 'false'], { message: 'kycPending doit être true ou false' })
      .optional(),
    accountStatus: z.enum(ACCOUNT_STATUSES, { message: 'Statut de compte invalide' }).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.kycStatus && data.kycPending) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['kycPending'],
        message: 'Utilisez kycStatus OU kycPending, pas les deux à la fois',
      });
    }
  });

export const listArtisanArtworksQuerySchema = z
  .object({
    page: pageSchema,
    limit: limitSchema,
    statut: z.enum(ARTWORK_STATUSES, { message: 'Statut œuvre invalide' }).optional(),
  })
  .strict();

export const listArtisanOrdersQuerySchema = z
  .object({
    page: pageSchema,
    limit: limitSchema,
    statut: z.enum(ORDER_STATUSES, { message: 'Statut commande invalide' }).optional(),
  })
  .strict();