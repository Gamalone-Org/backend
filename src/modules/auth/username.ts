import { z } from 'zod';

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 30;
export const USERNAME_REGEX = /^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/;

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUsername(username: string): boolean {
  if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) {
    return false;
  }
  return USERNAME_REGEX.test(username);
}

export type ResolvedLoginIdentifier =
  | { type: 'phone'; value: string }
  | { type: 'email'; value: string }
  | { type: 'username'; value: string };

function isPhoneLike(value: string): boolean {
  const stripped = value.replace(/[\s+\-()]/g, '');
  return /^\d{6,20}$/.test(stripped);
}

function isEmailLike(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/**
 * Resolves a raw login identifier into a typed lookup value.
 * When both `identifier` and `telephone` are provided, `identifier` wins.
 * When only `telephone` is provided (legacy), the value is resolved by content
 * (phone / email / username) so old clients transparently gain the new capability.
 */
export function resolveLoginIdentifier(params: {
  identifier?: string;
  telephone?: string;
}): ResolvedLoginIdentifier {
  const raw = (params.identifier ?? params.telephone ?? '').trim();
  if (!raw) {
    return { type: 'phone', value: '' };
  }

  if (isEmailLike(raw)) {
    return { type: 'email', value: raw.toLowerCase() };
  }

  if (isPhoneLike(raw)) {
    return { type: 'phone', value: raw };
  }

  return { type: 'username', value: normalizeUsername(raw) };
}

export const loginIdentifierSchema = z
  .object({
    telephone: z.string().trim().min(1, 'Phone number is required').optional(),
    identifier: z.string().trim().min(1, 'Identifier is required').optional(),
    motDePasse: z.string().min(1, 'Password is required').max(128),
    role: z.enum(['ACHETEUR', 'ARTISAN', 'ADMIN']).optional(),
  })
  .strict()
  .superRefine((val, ctx) => {
    if (!val.identifier && !val.telephone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Either telephone or identifier is required',
      });
    }
  });

export type LoginIdentifierInput = z.infer<typeof loginIdentifierSchema>;
