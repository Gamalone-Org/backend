import { z } from 'zod';

const pageSchema = z.coerce.number().int().min(1).default(1);
const limitSchema = z.coerce.number().int().min(1).max(50).default(20);
const uuidParam = z.string().uuid('Invalid id');

export const favoritesQuerySchema = z.object({
  page: pageSchema,
  limit: limitSchema,
});

export const favoriParamsSchema = z.object({
  oeuvreId: uuidParam,
});

export type FavoritesQuery = z.infer<typeof favoritesQuerySchema>;
export type FavoriParams = z.infer<typeof favoriParamsSchema>;