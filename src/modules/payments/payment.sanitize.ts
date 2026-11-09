const SENSITIVE_KEY_PATTERN = /secret|signature|token|authorization|rawbody|payload|api[-_]?key|cle[-_]?api/i;

const REDACTED = '[redacted]';

/**
 * Retire récursivement toute donnée potentiellement sensible d'un diagnostic
 * (message d'erreur, contexte) avant exposition au back-office. Les clés
 * suspectes sont remplacées par un marqueur ; les tableaux et objets imbriqués
 * sont parcourus. Ne lève jamais : un diagnostic illisible est simplement
 * remplacé par son texte.
 */
export function sanitizeDiagnostic(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.map((item) => sanitizeDiagnostic(item));
  if (typeof value === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEY_PATTERN.test(key)) {
        result[key] = REDACTED;
      } else {
        result[key] = sanitizeDiagnostic(entry);
      }
    }
    return result;
  }
  return undefined;
}
