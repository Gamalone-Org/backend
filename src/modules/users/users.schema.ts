import { z } from 'zod';
import {
  AdminAccessLevel,
  ArtisanType,
  BuyerType,
  UserRole,
  UserStatus,
} from '../../generated/prisma/client.js';

const USER_ROLES = Object.values(UserRole) as [UserRole, ...UserRole[]];
const USER_STATUSES = Object.values(UserStatus) as [UserStatus, ...UserStatus[]];
const ADMIN_LEVELS = Object.values(AdminAccessLevel) as [
  AdminAccessLevel,
  ...AdminAccessLevel[],
];
const ARTISAN_TYPES = Object.values(ArtisanType) as [ArtisanType, ...ArtisanType[]];
const BUYER_TYPES = Object.values(BuyerType) as [BuyerType, ...BuyerType[]];

const telephoneSchema = z.string().trim().min(1, 'Numéro de téléphone requis');

const motDePasseSchema = z
  .string()
  .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
  .max(128, 'Le mot de passe ne peut pas dépasser 128 caractères');

export const createUserSchema = z
  .object({
    role: z.enum(USER_ROLES),
    nom: z.string().trim().min(1, 'Nom requis').max(255).optional(),
    email: z
      .string()
      .trim()
      .email('Adresse e-mail invalide')
      .max(255)
      .optional(),
    telephone: telephoneSchema,
    motDePasse: motDePasseSchema,
    statut: z.enum(USER_STATUSES).optional(),
    niveauAcces: z
      .enum(ADMIN_LEVELS)
      .refine((level) => level !== 'SUPER_ADMIN', {
        message:
          "SUPER_ADMIN ne peut pas être créé via l'API. Utilisez le bootstrap dédié (npm run bootstrap:super-admin) ou une promotion via la mise à jour de rôle.",
      })
      .optional(),
    artisanProfile: z
      .object({
        type: z.enum(ARTISAN_TYPES).optional(),
        nomAtelier: z.string().trim().min(1, "Nom d'atelier requis").max(255),
        specialite: z.string().trim().min(1, 'Spécialité requise').max(255),
        localisation: z.string().trim().min(1, 'Localisation requise').max(255),
        biographie: z.string().max(5000).optional(),
        anneesExperience: z.coerce.number().int().min(0).max(100).optional(),
      })
      .optional(),
    buyerProfile: z
      .object({
        adresseLivraison: z.string().max(255).optional(),
        typeClient: z.enum(BUYER_TYPES).optional(),
        devise: z.string().max(10).optional(),
        langue: z.string().max(10).optional(),
      })
      .optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.role === 'ARTISAN' && !data.artisanProfile) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['artisanProfile'],
        message: "Le profil artisan est requis pour un rôle ARTISAN",
      });
    }
    if (data.role !== 'ARTISAN' && data.artisanProfile) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['artisanProfile'],
        message: "Le profil artisan est réservé au rôle ARTISAN",
      });
    }
    if (data.role === 'ADMIN' && !data.niveauAcces) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['niveauAcces'],
        message: "Le niveau d'accès est requis pour un rôle ADMIN",
      });
    }
    if (data.role !== 'ADMIN' && data.niveauAcces) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['niveauAcces'],
        message: "Le niveau d'accès est réservé au rôle ADMIN",
      });
    }
  });

export const updateUserStatutSchema = z
  .object({
    statut: z.enum(USER_STATUSES),
  })
  .strict();

export const updateUserRoleSchema = z
  .object({
    role: z.enum(USER_ROLES).refine((r) => r !== undefined, {
      message: 'Rôle requis',
    }),
    niveauAcces: z.enum(ADMIN_LEVELS).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.role === 'ADMIN' && !data.niveauAcces) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['niveauAcces'],
        message: "Le niveau d'accès est requis pour un rôle ADMIN",
      });
    }
    if (data.role !== 'ADMIN' && data.niveauAcces) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['niveauAcces'],
        message: "Le niveau d'accès est réservé au rôle ADMIN",
      });
    }
  });

export const userParamsSchema = z.object({
  id: z.string().uuid('Identifiant utilisateur invalide'),
});

const pageSchema = z.coerce.number().int().min(1).default(1);
const limitSchema = z.coerce.number().int().min(1).max(100).default(20);

export const listUsersQuerySchema = z
  .object({
    page: pageSchema,
    limit: limitSchema,
    q: z.string().trim().max(255).optional(),
    role: z.enum(USER_ROLES).optional(),
    statut: z.enum(USER_STATUSES).optional(),
    bloques: z.enum(['true', 'false']).optional(),
  })
  .strict();

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserStatutInput = z.infer<typeof updateUserStatutSchema>;
export type UpdateUserRoleInput = z.infer<typeof updateUserRoleSchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
