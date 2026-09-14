import { z } from 'zod';
import { AdminPermission } from '../../../generated/prisma/client.js';
import { isAdminManagementPermission } from '../../../config/admin-permissions.js';

const ADMIN_PERMISSIONS = Object.values(AdminPermission) as [AdminPermission, ...AdminPermission[]];

const telSchema = z.string().trim().min(1, 'Numéro de téléphone requis');

const motDePasseSchema = z
  .string()
  .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
  .max(128, 'Le mot de passe ne peut pas dépasser 128 caractères');

const permissionsSchema = z
  .array(z.enum(ADMIN_PERMISSIONS))
  .max(ADMIN_PERMISSIONS.length, 'Trop de permissions')
  .default([]);

/**
 * Niveaux d'accès qu'un SUPER_ADMIN peut attribuer lors de la création.
 * Un compte SUPER_ADMIN ne se crée JAMAIS depuis l'API : le premier est
 * initialisé par le script de bootstrap (Section 13), les suivants relèvent
 * d'une promotion explicite via la route utilisateurs (rôle ADMIN uniquement).
 */
export const createAdministrateurSchema = z
  .object({
    nom: z.string().trim().min(1, 'Nom requis').max(255),
    email: z.string().trim().email('Adresse e-mail invalide').max(255).optional(),
    telephone: telSchema,
    motDePasse: motDePasseSchema,
    niveauAcces: z.enum(['SUPPORT', 'MODERATEUR']).default('MODERATEUR'),
    departement: z.string().trim().max(255).optional(),
    permissions: permissionsSchema,
  })
  .strict()
  .superRefine((data, ctx) => {
    const unique = new Set<string>(data.permissions);
    if (unique.size !== data.permissions.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['permissions'],
        message: 'Les permissions doivent être uniques',
      });
    }
    if (data.permissions.some((p) => isAdminManagementPermission(p))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['permissions'],
        message: 'Les permissions ADMINS_* sont réservées au SUPER_ADMIN direct',
      });
    }
  });

export const updateAdministrateurSchema = z
  .object({
    nom: z.string().trim().min(1, 'Nom requis').max(255).optional(),
    email: z.string().trim().email('Adresse e-mail invalide').max(255).nullable().optional(),
    departement: z.string().trim().max(255).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (Object.keys(data).length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: [],
        message: 'Au moins un champ doit être fourni',
      });
    }
  });

export const updateAdministrateurPermissionsSchema = z
  .object({
    permissions: permissionsSchema,
  })
  .strict()
  .superRefine((data, ctx) => {
    const unique = new Set<string>(data.permissions);
    if (unique.size !== data.permissions.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['permissions'],
        message: 'Les permissions doivent être uniques',
      });
    }
    if (data.permissions.some((p) => isAdminManagementPermission(p))) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['permissions'],
        message: 'Les permissions ADMINS_* sont réservées au SUPER_ADMIN direct',
      });
    }
  });

export const updateAdministrateurStatutSchema = z
  .object({
    statut: z.enum(['ACTIF', 'INACTIF', 'SUSPENDU']),
  })
  .strict();

export const administrateurParamsSchema = z.object({
  id: z.string().uuid('Identifiant administrateur invalide'),
});

const pageSchema = z.coerce.number().int().min(1).default(1);
const limitSchema = z.coerce.number().int().min(1).max(100).default(20);

export const listAdministrateursQuerySchema = z
  .object({
    page: pageSchema,
    limit: limitSchema,
    q: z.string().trim().max(255).optional(),
    statut: z.enum(['ACTIF', 'INACTIF', 'SUSPENDU', 'EN_ATTENTE_VALIDATION']).optional(),
    niveauAcces: z.enum(['SUPPORT', 'MODERATEUR', 'SUPER_ADMIN']).optional(),
  })
  .strict();

export type CreateAdministrateurInput = z.infer<typeof createAdministrateurSchema>;
export type UpdateAdministrateurInput = z.infer<typeof updateAdministrateurSchema>;
export type UpdateAdministrateurPermissionsInput = z.infer<
  typeof updateAdministrateurPermissionsSchema
>;
export type UpdateAdministrateurStatutInput = z.infer<typeof updateAdministrateurStatutSchema>;
export type ListAdministrateursQuery = z.infer<typeof listAdministrateursQuerySchema>;
