import { z } from 'zod';
import { ArtisanType } from '../../generated/prisma/client.js';

const telephoneSchema = z.string().trim().min(1, 'Phone number is required');

const emailSchema = z.email('Invalid email').max(255).optional();

const nomSchema = z.string().trim().min(1, 'Name is required').max(120);

const motDePasseSchema = z.string().min(8, 'Password must be at least 8 characters').max(128);

const registerBase = {
  telephone: telephoneSchema,
  email: emailSchema,
  motDePasse: motDePasseSchema,
};

export const registerSchema = z.discriminatedUnion('role', [
  z
    .object({
      role: z.literal('ACHETEUR'),
      nom: nomSchema,
      ...registerBase,
    })
    .strict(),
  z
    .object({
      role: z.literal('ARTISAN'),
      nom: nomSchema,
      type: z.nativeEnum(ArtisanType).default(ArtisanType.ARTISAN),
      specialite: z.string().trim().min(1, 'Specialite is required').max(120),
      localisation: z.string().trim().min(1, 'Localisation is required').max(255),
      ...registerBase,
    })
    .strict(),
]);

export const loginSchema = z
  .object({
    telephone: telephoneSchema,
    motDePasse: z.string().min(1, 'Password is required').max(128),
    role: z.enum(['ACHETEUR', 'ARTISAN']).optional(),
  })
  .strict();

export const verifyPhoneSchema = z
  .object({
    telephone: telephoneSchema,
    code: z.string().trim().min(1, 'OTP is required'),
  })
  .strict();

export type RegisterSchemaInput = z.infer<typeof registerSchema>;
export type LoginSchemaInput = z.infer<typeof loginSchema>;
export type VerifyPhoneSchemaInput = z.infer<typeof verifyPhoneSchema>;
