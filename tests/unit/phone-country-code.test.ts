import { describe, it, expect } from 'vitest';
import { PhoneService, countryCodeSchema, otpPhoneFields, telephonePhoneFields } from '../../src/modules/auth/services/PhoneService.js';
import { InvalidPhoneError } from '../../src/common/errors/AppError.js';

const service = new PhoneService();

/** Équivalent E.164 attendu en base / en sortie d'API. */
const TOGO_E164 = '+22890123456';
const FRANCE_E164 = '+33612345678';
const USA_E164 = '+12125551234';

describe('PhoneService — countryCode + phone', () => {
  describe('normalizeCountryCode', () => {
    it.each([
      { input: '+33', expected: '+33' },
      { input: '33', expected: '+33' },
      { input: '  +33  ', expected: '+33' },
      { input: '+228', expected: '+228' },
      { input: '228', expected: '+228' },
      { input: '+1', expected: '+1' },
      { input: '+225', expected: '+225' },
      { input: '+ (33)', expected: '+33' },
      { input: '+33.', expected: '+33' },
    ])('normalise $input en $expected', ({ input, expected }) => {
      expect(service.normalizeCountryCode(input)).toBe(expected);
    });

    it.each([
      { input: '', label: 'vide' },
      { input: '   ', label: 'blancs' },
      { input: '+', label: 'plus seul' },
      { input: 'abc', label: 'non numérique' },
      { input: '+1234', label: '4 chiffres (hors E.164)' },
      { input: '++33', label: 'double plus' },
      { input: '+33+1', label: 'deux indicatifs' },
    ])('rejette un indicatif $label', ({ input }) => {
      expect(() => service.normalizeCountryCode(input)).toThrow(InvalidPhoneError);
    });
  });

  describe('composeInternational', () => {
    it.each([
      { countryCode: '+228', national: '90123456', expected: TOGO_E164 },
      { countryCode: '+33', national: '612345678', expected: FRANCE_E164 },
      { countryCode: '+1', national: '2125551234', expected: USA_E164 },
      { countryCode: '33', national: '612345678', expected: FRANCE_E164 },
      { countryCode: '+33', national: '06 12 34 56 78', expected: FRANCE_E164 },
      { countryCode: '+33', national: '06-12-34-56-78', expected: FRANCE_E164 },
      { countryCode: '+33', national: '(06) 12 34 56 78', expected: FRANCE_E164 },
      { countryCode: '+228', national: '090 12 34 56', expected: TOGO_E164 },
    ])('compose $countryCode + $national en $expected', ({ countryCode, national, expected }) => {
      expect(service.composeInternational(countryCode, national)).toBe(expected);
    });

    it('refuse un numéro national commençant par +', () => {
      expect(() => service.composeInternational('+33', '+33612345678')).toThrow(InvalidPhoneError);
    });

    it('refuse un numéro national commençant par 00 (numéro international envoyé par erreur)', () => {
      expect(() => service.composeInternational('+33', '0033612345678')).toThrow(InvalidPhoneError);
    });

    it('refuse un numéro national vide', () => {
      expect(() => service.composeInternational('+33', '   ')).toThrow(InvalidPhoneError);
    });

    it('refuse un indicatif invalide', () => {
      expect(() => service.composeInternational('+1234', '612345678')).toThrow(InvalidPhoneError);
    });

    it('retire le préfixe national de trunk 0', () => {
      // Le "0" de trunk ne fait pas partie du numéro E.164.
      expect(service.composeInternational('+33', '0612345678')).toBe(FRANCE_E164);
      expect(service.composeInternational('+228', '090123456')).toBe(TOGO_E164);
    });

    it('applique la longueur minimale E.164 après composition', () => {
      // +33 + 1234567 = 9 chiffres : E.164 valide structurellement.
      expect(service.normalize(service.composeInternational('+33', '1234567'))).toBe('+331234567');
      // +33 + 12345 = 7 chiffres : trop court, refusé par normalize().
      expect(() => service.normalize(service.composeInternational('+33', '12345'))).toThrow(
        InvalidPhoneError
      );
      // +33 + 1 seul chiffre = 4 chiffres : refusé.
      expect(() => service.normalize(service.composeInternational('+33', '1'))).toThrow(
        InvalidPhoneError
      );
    });
  });

  describe('resolveFromRequest', () => {
    describe('avec countryCode (nouveau contrat)', () => {
      it.each([
        { label: '+228 (Togo)', countryCode: '+228', phone: '90123456', expected: TOGO_E164 },
        { label: '+33 (France)', countryCode: '+33', phone: '612345678', expected: FRANCE_E164 },
        { label: '+1 (US)', countryCode: '+1', phone: '2125551234', expected: USA_E164 },
      ])('compose $label', ({ countryCode, phone, expected }) => {
        expect(service.resolveFromRequest({ countryCode, phone })).toBe(expected);
      });

      it('compose un numéro togolais exactement comme le contrat historique', () => {
        // Garantit la compatibilité : +228 + 90123456 === l'ancien +22890123456.
        const nouveau = service.resolveFromRequest({ countryCode: '+228', phone: '90123456' });
        const ancien = service.normalize(TOGO_E164);
        expect(nouveau).toBe(ancien);
        expect(service.compare(nouveau, ancien)).toBe(true);
      });

      it('traite countryCode vide comme absent (contrat historique)', () => {
        expect(service.resolveFromRequest({ countryCode: '', phone: FRANCE_E164 })).toBe(FRANCE_E164);
        expect(service.resolveFromRequest({ countryCode: '   ', phone: TOGO_E164 })).toBe(TOGO_E164);
        expect(service.resolveFromRequest({ phone: TOGO_E164 })).toBe(TOGO_E164);
      });
    });

    describe('sans countryCode (contrat historique inchange)', () => {
      it.each([
        { input: TOGO_E164 },
        { input: FRANCE_E164 },
        { input: USA_E164 },
        { input: '0022890123456' },
        { input: '+228 90 12 34 56' },
        { input: '+228-90-12-34-56' },
      ])('normalise $input comme avant', ({ input }) => {
        expect(service.resolveFromRequest({ phone: input })).toBe(service.normalize(input));
      });

      it('normalise toujours vers un E.164 avec +', () => {
        expect(service.resolveFromRequest({ phone: '0022890123456' })).toBe(TOGO_E164);
        expect(service.resolveFromRequest({ phone: '22890123456' })).toBe(TOGO_E164);
      });
    });

    describe('rejets', () => {
      it.each([
        { countryCode: '+33', phone: '', label: 'numéro vide' },
        { countryCode: '', phone: '', label: 'rien du tout' },
        { countryCode: '+33', phone: '+33612345678', label: 'numéro déjà international' },
        { countryCode: '33abc', phone: '612345678', label: 'indicatif non numérique' },
        { countryCode: '+1234', phone: '2125551234', label: 'indicatif trop long' },
        { countryCode: '+228', phone: '90', label: 'résultat trop court' },
      ])('rejette : $label', ({ countryCode, phone }) => {
        expect(() => service.resolveFromRequest({ countryCode, phone })).toThrow(InvalidPhoneError);
      });

      it('rejette un countryCode non-string', () => {
        expect(() =>
          service.resolveFromRequest({ countryCode: 33 as unknown as string, phone: '612345678' })
        ).toThrow(InvalidPhoneError);
      });
    });

    describe('pas de whitelist de pays', () => {
      it('accepte des indicatifs de pays hors du Togo, France et USA', () => {
        const autres = [
          { countryCode: '+225', phone: '0701234567' },
          { countryCode: '+229', phone: '90011223' },
          { countryCode: '+81', phone: '9012345678' },
          { countryCode: '+49', phone: '15112345678' },
          { countryCode: '+55', phone: '11987654321' },
          { countryCode: '+27', phone: '821234567' },
          { countryCode: '+234', phone: '8012345678' },
          { countryCode: '+7', phone: '9991234567' },
        ];

        for (const { countryCode, phone } of autres) {
          const composed = service.resolveFromRequest({ countryCode, phone });
          expect(composed.startsWith(countryCode)).toBe(true);
          expect(service.isValid(composed)).toBe(true);
        }
      });
    });
  });

  describe('countryCodeSchema (Zod)', () => {
    it.each(['+33', '33', '+228', '228', '+1', '  +33  '])('accepte %j', (input) => {
      expect(countryCodeSchema.safeParse(input).success).toBe(true);
    });

    it.each(['', '  ', '+', 'abc', '+1234', '++33', '+33+1', '+ 33 44'])(
      'rejette %j',
      (input) => {
        expect(countryCodeSchema.safeParse(input).success).toBe(false);
      }
    );

    it('produit un message exploitable par le client', () => {
      const result = countryCodeSchema.safeParse('+1234');
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('Country code must be');
      }
    });
  });

  describe('fragments Zod partagés', () => {
    it('otpPhoneFields expose countryCode optionnel + phone requis', () => {
      expect(otpPhoneFields.countryCode.isOptional()).toBe(true);
      expect(otpPhoneFields.phone.safeParse('612345678').success).toBe(true);
      expect(otpPhoneFields.phone.safeParse('').success).toBe(false);
    });

    it('telephonePhoneFields expose countryCode optionnel + telephone requis', () => {
      expect(telephonePhoneFields.countryCode.isOptional()).toBe(true);
      expect(telephonePhoneFields.telephone.safeParse('612345678').success).toBe(true);
      expect(telephonePhoneFields.telephone.safeParse('').success).toBe(false);
    });
  });
});
