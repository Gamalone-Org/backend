import { z } from 'zod';
import { InvalidPhoneError } from '../../../common/errors/AppError.js';

/** Longueur totale d'un numéro E.164, hors `+`. */
const E164_MIN_DIGITS = 8;
const E164_MAX_DIGITS = 15;

/** Longueur d'un indicatif pays : 1 à 3 chiffres (E.164). */
const COUNTRY_CODE_MIN_DIGITS = 1;
const COUNTRY_CODE_MAX_DIGITS = 3;

/**
 * Entrée de requête telle que reçue par les endpoints auth.
 * `countryCode` est OPTIONNEL : son absence preserve le contrat historique
 * où `phone`/`telephone` porte déjà le numéro international complet.
 */
export type PhoneRequestInput = {
  countryCode?: string | undefined;
  phone: string;
};

export class PhoneService {
  normalize(phone: string): string {
    const trimmed = phone.trim();

    if (!trimmed) {
      throw new InvalidPhoneError('Phone number is required');
    }

    const digitsOnly = trimmed.replace(/\s+/g, '').replace(/[^\d+]/g, '');

    if (!digitsOnly) {
      throw new InvalidPhoneError('Phone number is invalid');
    }

    const normalized = digitsOnly.startsWith('+') ? digitsOnly : `+${digitsOnly.replace(/^00/, '')}`;

    if (!this.isValid(normalized)) {
      throw new InvalidPhoneError('Phone number format is invalid');
    }

    return normalized;
  }

  validate(phone: string): string {
    return this.normalize(phone);
  }

  isValid(phone: string): boolean {
    if (!phone || typeof phone !== 'string') {
      return false;
    }

    const trimmed = phone.trim();

    if (!trimmed) {
      return false;
    }

    if (!new RegExp(`^\\+\\d{${E164_MIN_DIGITS},${E164_MAX_DIGITS}}$`).test(trimmed)) {
      return false;
    }

    const digits = trimmed.slice(1);
    return (
      digits.length >= E164_MIN_DIGITS && digits.length <= E164_MAX_DIGITS && /^\d+$/.test(digits)
    );
  }

  /**
   * Normalise un indicatif pays en `+<1..3 chiffres>`.
   * Accepte `33`, `+33`, `+ 33` → `+33`.
   */
  normalizeCountryCode(rawCountryCode: string): string {
    const trimmed = typeof rawCountryCode === 'string' ? rawCountryCode.trim() : '';

    if (!trimmed) {
      throw new InvalidPhoneError('Country code is required');
    }

    const digits = trimmed.replace(/[\s.\-()]/g, '').replace(/^\+/, '');

    if (!new RegExp(`^\\d{${COUNTRY_CODE_MIN_DIGITS},${COUNTRY_CODE_MAX_DIGITS}}$`).test(digits)) {
      throw new InvalidPhoneError(
        `Country code must be ${COUNTRY_CODE_MIN_DIGITS} to ${COUNTRY_CODE_MAX_DIGITS} digits, e.g. +33`
      );
    }

    return `+${digits}`;
  }

  /**
   * Compose l'indicatif pays et le numéro national en un numéro international.
   *
   * Règles appliquées quand `countryCode` est fourni :
   * - le `+` est refusé côté numéro national (il appartient à l'indicatif pays) ;
   * - le préfixe international `00` est refusé : le client a envoyé un numéro
   *   international complet alors qu'un numéro national est attendu ;
   * - le préfixe national de trunk `0` est retiré (`06 12 34 56 78` + `+33`
   *   → `+33612345678`) car le `0` ne fait pas partie du numéro E.164.
   *
   * La validation E.164 complète reste assurée par `normalize()`.
   */
  composeInternational(countryCode: string, nationalNumber: string): string {
    const normalizedCountryCode = this.normalizeCountryCode(countryCode);
    const rawNational = typeof nationalNumber === 'string' ? nationalNumber.trim() : '';

    if (!rawNational) {
      throw new InvalidPhoneError('Phone number is required');
    }

    if (rawNational.startsWith('+')) {
      throw new InvalidPhoneError(
        'phone must be a national number when countryCode is provided (remove the leading +)'
      );
    }

    if (rawNational.replace(/[\s.\-()]/g, '').startsWith('00')) {
      throw new InvalidPhoneError(
        'phone must be a national number when countryCode is provided (remove the leading 00)'
      );
    }

    const national = rawNational.replace(/\D/g, '').replace(/^0+/, '');

    if (!national) {
      throw new InvalidPhoneError('Phone number is invalid');
    }

    return `${normalizedCountryCode}${national}`;
  }

  /**
   * Point d'entrée unique des endpoints auth.
   * - `countryCode` fourni → composition `countryCode` + `phone` (numéro national).
   * - `countryCode` absent ou vide → `phone` est déjà le numéro international
   *   (contrat historique, comportement inchangé).
   *
   * Un `countryCode` présent mais invalide lève une erreur au lieu d'être
   * ignoré : l'ignorer produirait un numéro FAUX (`+612345678` au lieu de
   * `+33612345678`), donc un utilisateur injoignable.
   */
  resolveFromRequest(input: PhoneRequestInput): string {
    const rawPhone = typeof input?.phone === 'string' ? input.phone : '';
    const rawCountryCode = input?.countryCode;

    if (rawCountryCode !== undefined && rawCountryCode !== null) {
      if (typeof rawCountryCode !== 'string') {
        throw new InvalidPhoneError('Country code is invalid');
      }

      // Une chaîne vide est traitée comme « non fourni » : le frontend peut
      // envoyer `countryCode: selection?.code ?? ''`.
      if (rawCountryCode.trim() !== '') {
        return this.normalize(this.composeInternational(rawCountryCode, rawPhone));
      }
    }

    return this.normalize(rawPhone);
  }

  compare(phone1: string, phone2: string): boolean {
    try {
      return this.normalize(phone1) === this.normalize(phone2);
    } catch {
      return false;
    }
  }
}

/**
 * Indicatif pays optionnel, par exemple `"+33"`.
 * Validé au format mais NON composé ici : la composition et la validation
 * E.164 finale sont assurées par `PhoneService.resolveFromRequest()`, qui
 * reste l'unique point de normalisation du système.
 */
export const countryCodeSchema = z
  .string()
  .trim()
  .min(1, 'Country code is required')
  .max(8, 'Country code is too long')
  .refine(
    (value) =>
      new RegExp(
        `^\\+?\\d{${COUNTRY_CODE_MIN_DIGITS},${COUNTRY_CODE_MAX_DIGITS}}$`
      ).test(value.replace(/[\s.\-()]/g, '')),
    `Country code must be ${COUNTRY_CODE_MIN_DIGITS} to ${COUNTRY_CODE_MAX_DIGITS} digits, e.g. +33`
  );

/**
 * Fragments Zod partagés par les endpoints qui nomment le champ `phone`
 * (`/otp/send`, `/otp/resend`, `/otp/verify`).
 *
 * `phone` reste volontairement peu contraint : il accepte indifféremment un
 * numéro national (quand `countryCode` est fourni) ou un numéro international
 * complet (contrat historique). La validation fine est faite par
 * `PhoneService` afin de conserver des codes d'erreur 400 homogènes.
 */
export const otpPhoneFields = {
  countryCode: countryCodeSchema.optional(),
  phone: z.string().trim().min(1, 'Phone number is required'),
};

/** Même chose pour les endpoints qui nomment le champ `telephone`. */
export const telephonePhoneFields = {
  countryCode: countryCodeSchema.optional(),
  telephone: z.string().trim().min(1, 'Phone number is required'),
};
