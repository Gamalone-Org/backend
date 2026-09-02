import { z } from 'zod';
import { OrderStatus } from '../../generated/prisma/client.js';

const ORDER_STATUSES = Object.values(OrderStatus) as [OrderStatus, ...OrderStatus[]];

const uuidParam = z.string().uuid('Invalid id');
const pageSchema = z.coerce.number().int().min(1).default(1);
const limitSchema = z.coerce.number().int().min(1).max(50).default(20);

const fraisLivraisonSchema = z
  .number()
  .nonnegative('Les frais de livraison ne peuvent pas être négatifs')
  .max(999_999_999_999);

const quantiteSchema = z
  .number()
  .int('La quantité doit être un entier')
  .min(1, 'La quantité doit être au moins 1')
  .max(100, 'La quantité maximale par article est 100');

const adresseLivraisonSchema = z
  .string()
  .trim()
  .min(1, 'Adresse de livraison requise')
  .max(500);

const transporteurSchema = z.string().trim().min(1, 'Transporteur requis').max(255);

export const createCommandeSchema = z
  .object({
    articles: z
      .array(
        z
          .object({
            oeuvreId: uuidParam,
            quantite: quantiteSchema,
          })
          .strict()
      )
      .min(1, 'Au moins un article est requis')
      .max(50, 'Maximum 50 articles par commande')
      .refine(
        (items) => new Set(items.map((item) => item.oeuvreId)).size === items.length,
        { message: 'Une œuvre ne peut apparaître qu’une seule fois dans une commande' }
      ),
    adresseLivraison: adresseLivraisonSchema,
    transporteur: transporteurSchema,
    fraisLivraison: fraisLivraisonSchema.default(0),
    methodePaiement: z.enum([
      'CARTE_BANCAIRE',
      'MOBILE_MONEY',
      'VIREMENT',
      'ESPECES',
    ]),
  })
  .strict();

export const commandeIdParamsSchema = z.object({
  id: uuidParam,
});

export const statutCommandeSchema = z
  .object({
    statut: z.enum(ORDER_STATUSES),
  })
  .strict();

export const adminCommandesQuerySchema = z.object({
  page: pageSchema,
  limit: limitSchema,
  statut: z.enum(ORDER_STATUSES).optional(),
  q: z.string().trim().max(255).optional(),
});

export const myCommandesQuerySchema = z.object({
  page: pageSchema,
  limit: limitSchema,
});

export type CreateCommandeInput = z.infer<typeof createCommandeSchema>;
export type CommandeIdParams = z.infer<typeof commandeIdParamsSchema>;
export type StatutCommandeInput = z.infer<typeof statutCommandeSchema>;
export type AdminCommandesQuery = z.infer<typeof adminCommandesQuerySchema>;
export type MyCommandesQuery = z.infer<typeof myCommandesQuerySchema>;
