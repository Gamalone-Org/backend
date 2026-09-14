import { z } from 'zod';

const pageSchema = z.coerce.number().int().min(1).default(1);
const limitSchema = z.coerce.number().int().min(1).max(50).default(20);

// ---------------------------------------------------------------------------
// List artisans
// ---------------------------------------------------------------------------

export const listArtisansQuerySchema = z
  .object({
    page: pageSchema,
    limit: limitSchema,
    q: z.string().trim().min(1).max(255).optional(),
    pays: z.string().trim().min(1).max(255).optional(),
    ville: z.string().trim().min(1).max(255).optional(),
    specialite: z.string().trim().min(1).max(255).optional(),
    tri: z.enum(['recent', 'oldest', 'name_asc', 'name_desc']).default('recent'),
  })
  .strict();

// ---------------------------------------------------------------------------
// Artisan profile params
// ---------------------------------------------------------------------------

export const artisanParamsSchema = z.object({
  identifier: z.string().uuid('Identifiant artisan invalide'),
});

// ---------------------------------------------------------------------------
// Artisan oeuvres query
// ---------------------------------------------------------------------------

export const artisanOeuvresQuerySchema = z.object({
  page: pageSchema,
  limit: limitSchema,
});

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export type ListArtisansQuery = z.infer<typeof listArtisansQuerySchema>;
export type ArtisanParams = z.infer<typeof artisanParamsSchema>;
export type ArtisanOeuvresQuery = z.infer<typeof artisanOeuvresQuerySchema>;
