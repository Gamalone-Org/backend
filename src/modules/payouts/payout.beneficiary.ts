import type { ArtisanPaiementMethode } from '../../generated/prisma/client.js';

/**
 * Construit la destination d'un reversement à partir de la préférence de
 * versement de l'artisan. Aucune coordonnée brute n'est renvoyée pour
 * l'exposition back-office : `masquee` est la seule représentation destinée à
 * être affichée/journalisée.
 *
 * Mapping FedaPay :
 *   - MOBILE_MONEY      → pas de `mode` explicite : FedaPay détecte l'opérateur.
 *   - VIREMENT_BANCAIRE → `mode: 'bank'` (support à confirmer côté FedaPay ; on
 *     ne convertit JAMAIS un virement en Mobile Money).
 */

export type BeneficiaryPreference = {
  methode: ArtisanPaiementMethode;
  mobileMoneyNumero: string | null;
  mobileMoneyOperateur: string | null;
  virementNomBanque: string | null;
  virementIban: string | null;
  virementNomCompte: string | null;
};

export type PayoutPhone = { number: number | string; country: string };

export type PayoutDestination = {
  mode: string | null;
  phone: PayoutPhone | null;
  masquee: string;
};

const E164_COUNTRY_CODES: ReadonlyArray<readonly [string, string]> = [
  ['225', 'CI'],
  ['226', 'BF'],
  ['227', 'NE'],
  ['228', 'TG'],
  ['229', 'BJ'],
  ['221', 'SN'],
  ['223', 'ML'],
  ['245', 'GW'],
  ['33', 'FR'],
];

export function buildPayoutDestination(
  preference: BeneficiaryPreference,
  fallbackPhone: string
): PayoutDestination {
  if (preference.methode === 'MOBILE_MONEY') {
    const phone = resolvePhone(preference.mobileMoneyNumero, fallbackPhone);
    return {
      mode: null,
      phone,
      masquee: maskMobileMoney(preference.mobileMoneyNumero, preference.mobileMoneyOperateur),
    };
  }

  return {
    mode: 'bank',
    phone: toE164Phone(fallbackPhone),
    masquee: maskBank(preference.virementIban, preference.virementNomBanque),
  };
}

/** Tente le numéro dédié puis, à défaut, le numéro du compte utilisateur. */
function resolvePhone(preferred: string | null, fallback: string): PayoutPhone | null {
  return toE164Phone(preferred) ?? toE164Phone(fallback);
}

/**
 * Convertit un numéro en `{ number, country }` FedaPay uniquement si le pays est
 * déterminable de façon fiable (E.164 avec indicatif mappé). Sinon `null` : on
 * préfère omettre le téléphone plutôt que d'envoyer un pays incorrect.
 */
function toE164Phone(value: string | null | undefined): PayoutPhone | null {
  if (!value) return null;
  const raw = value.trim().replace(/[\s.]/g, '');
  if (!raw.startsWith('+')) return null;
  const digits = raw.slice(1).replace(/\D/g, '');
  for (const [code, country] of E164_COUNTRY_CODES) {
    if (digits.startsWith(code)) {
      const number = digits.slice(code.length);
      if (number.length < 6) return null;
      return { number, country };
    }
  }
  return null;
}

function maskMobileMoney(numero: string | null, operateur: string | null): string {
  const suffix = lastDigits(numero, 2);
  const prefix = operateur?.trim() ? `${operateur.trim()} ` : '';
  return `${prefix}${suffix ? `•••• ${suffix}` : '••••'}`;
}

function maskBank(iban: string | null, banque: string | null): string {
  const suffix = lastDigits(iban, 4);
  const prefix = banque?.trim() ? `${banque.trim()} ` : '';
  return `${prefix}${suffix ? `•••• ${suffix}` : '••••'}`;
}

function lastDigits(value: string | null, count: number): string {
  if (!value) return '';
  const digits = value.replace(/\s/g, '');
  return digits.slice(-count);
}

/**
 * Découpe un nom complet au format FedaPay (`firstname` / `lastname`). Retourne
 * `null` si le nom est vide (l'appelant doit alors refuser le reversement).
 */
export function splitName(nom: string | null): { firstname: string; lastname: string } | null {
  const parts = nom?.trim().split(/\s+/).filter(Boolean) ?? [];
  if (parts.length === 0) return null;
  if (parts.length === 1) return { firstname: parts[0]!, lastname: parts[0]! };
  return { firstname: parts.slice(0, -1).join(' '), lastname: parts[parts.length - 1]! };
}
