import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://user:password@localhost:5432/gamalone_test';
});

import { OtpPurpose } from '../../src/generated/prisma/client.js';
import { PhoneService } from '../../src/modules/auth/services/PhoneService.js';
import { OtpService } from '../../src/modules/auth/services/OtpService.js';
import { resolveLoginIdentifier } from '../../src/modules/auth/username.js';
import {
  InvalidOtpError,
  InvalidPhoneError,
  OtpResendCooldownError,
} from '../../src/common/errors/AppError.js';

/**
 * GAMALONE doit gérer les numéros de téléphone internationaux (E.164) et pas
 * uniquement les numéros togolais. Ces tests verrouillent ce contrat.
 *
 * Jeux de numéros couverts : +228 (Togo, référence), +33 (France), +1 (US/Canada).
 */

/** Un numéro est « valide » si, une fois normalisé, il respecte `+` + 8..15 chiffres. */
const E164 = /^\+\d{8,15}$/;

const INTL_NUMBERS = [
  { label: 'Togo (+228)', e164: '+22890123456', variants: ['+22890123456', '22890123456', '0022890123456', '+228 90 12 34 56', '+228-90-12-34-56', '  +22890123456  '] },
  { label: 'France (+33)', e164: '+33612345678', variants: ['+33612345678', '33612345678', '0033612345678', '+33 6 12 34 56 78', '+33-6-12-34-56-78'] },
  { label: 'US/Canada (+1)', e164: '+12125551234', variants: ['+12125551234', '12125551234', '0012125551234', '+1 (212) 555-1234', '+1-212-555-1234'] },
  { label: 'Benin (+229)', e164: '+22990123456', variants: ['+22990123456', '0022990123456'] },
  { label: 'Cote d\'Ivoire (+225)', e164: '+2250712345678', variants: ['+2250712345678', '002250712345678'] },
  { label: 'Japon (+81)', e164: '+819012345678', variants: ['+819012345678', '00819012345678'] },
  { label: 'Allemagne (+49)', e164: '+4915123456789', variants: ['+4915123456789'] },
  { label: 'Brasil (+55)', e164: '+5511987654321', variants: ['+5511987654321'] },
  { label: 'Afrique du Sud (+27)', e164: '+27821234567', variants: ['+27821234567'] },
];

const INVALID_NUMBERS = [
  { label: 'lettres', value: 'abc' },
  { label: 'vide', value: '' },
  { label: 'seulement un +', value: '+' },
  { label: 'double +', value: '++22890123456' },
  { label: 'trop court (7 chiffres)', value: '+1234567' },
  { label: 'trop long (16 chiffres)', value: '+1234567890123456' },
  { label: '+ au milieu', value: '228+90123456' },
  { label: 'lettres après indicatif', value: '+228ABC1234' },
];

describe('PhoneService — numéros internationaux', () => {
  const phoneService = new PhoneService();

  describe.each(INTL_NUMBERS)('$label', ({ e164, variants }) => {
    it.each(variants)('normalise %j vers la forme E.164 canonique', (input) => {
      expect(phoneService.normalize(input)).toBe(e164);
    });

    it('est considéré valide', () => {
      expect(phoneService.isValid(e164)).toBe(true);
    });

    it('valide via validate() et renvoie la valeur normalisée', () => {
      expect(phoneService.validate(e164)).toBe(e164);
    });
  });

  it('toutes les variantes d’un même numéro normalisent à la même valeur E.164', () => {
    const togo = INTL_NUMBERS[0];
    for (const variant of togo.variants) {
      expect(phoneService.normalize(variant)).toBe(togo.e164);
    }
  });

  it('compare deux écritures différentes du même numéro comme égales', () => {
    expect(phoneService.compare('+33612345678', '0033612345678')).toBe(true);
    expect(phoneService.compare('+12125551234', '+1 (212) 555-1234')).toBe(true);
    expect(phoneService.compare('+22890123456', '0022890123456')).toBe(true);
  });

  it('distingue deux numéros différents même de même pays', () => {
    expect(phoneService.compare('+33612345678', '+33612345679')).toBe(false);
    expect(phoneService.compare('+12125551234', '+12125551235')).toBe(false);
  });

  it('ne confond pas deux pays différents partageant le même suffixe', () => {
    expect(phoneService.compare('+22890123456', '+22990123456')).toBe(false);
  });

  it('comparefalse au lieu de lever sur une entrée invalide', () => {
    expect(phoneService.compare('+1234567', '+22890123456')).toBe(false);
    expect(phoneService.compare('abc', '+22890123456')).toBe(false);
  });

  describe.each(INVALID_NUMBERS)('numéro invalide : $label', ({ value }) => {
    it('est rejeté par normalize()', () => {
      expect(() => phoneService.normalize(value)).toThrow(InvalidPhoneError);
    });

    it('est rejeté par validate()', () => {
      expect(() => phoneService.validate(value)).toThrow(InvalidPhoneError);
    });

    it('est rejeté par isValid()', () => {
      expect(phoneService.isValid(value)).toBe(false);
    });
  });

  it('laisse passer tout numéro respectuant le contrat E.164 (+ followed by 8 to 15 digits)', () => {
    const eightDigits = '+12345678';
    const fifteenDigits = '+123456789012345';
    expect(phoneService.normalize(eightDigits)).toBe(eightDigits);
    expect(phoneService.normalize(fifteenDigits)).toBe(fifteenDigits);
    expect(E164.test(phoneService.normalize(eightDigits))).toBe(true);
    expect(E164.test(phoneService.normalize(fifteenDigits))).toBe(true);
  });

  it('ne retire pas un indicatif paysuknown et ne tronque pas le numéro', () => {
    expect(phoneService.normalize('+9991234567')).toBe('+9991234567');
  });
});

describe('resolveLoginIdentifier — numéros internationaux à la connexion', () => {
  it.each(INTL_NUMBERS)('classifie un numéro $label comme téléphone', ({ e164, variants }) => {
    for (const variant of variants) {
      const resolved = resolveLoginIdentifier({ telephone: variant });
      expect(resolved.type).toBe('phone');
    }
  });

  it('ne confond pas un numéro international avec un email', () => {
    const resolved = resolveLoginIdentifier({ identifier: 'awa.koffi@example.com' });
    expect(resolved.type).toBe('email');
  });

  it('ne confond pas un numéro international avec un username', () => {
    const resolved = resolveLoginIdentifier({ identifier: 'awa.koffi' });
    expect(resolved.type).toBe('username');
  });
});

function createOtpRepository() {
  return {
    create: vi.fn(),
    findLatestByPhoneAndPurpose: vi.fn(),
    findLatestActiveByPhoneAndPurpose: vi.fn(),
    invalidateActiveByPhoneAndPurpose: vi.fn(),
    incrementAttempts: vi.fn(),
    markUsed: vi.fn(),
    markExpired: vi.fn(),
    markBlocked: vi.fn(),
    countRecentByPhone: vi.fn().mockResolvedValue(0),
  };
}

function otpRecord(phone: string, codeHash: string, overrides: Record<string, unknown> = {}) {
  return {
    id: `otp-${phone}`,
    userId: null,
    phone,
    codeHash,
    purpose: OtpPurpose.PHONE_VERIFICATION,
    status: 'EN_ATTENTE',
    expiresAt: new Date(Date.now() + 300_000),
    createdAt: new Date(),
    usedAt: null,
    attemptCount: 0,
    maxAttempts: 5,
    lastSentAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('OtpService — envoi / resend / vérification sur numéros internationaux', () => {
  let repo: ReturnType<typeof createOtpRepository>;
  let service: OtpService;

  beforeEach(() => {
    vi.clearAllMocks();
    repo = createOtpRepository();
    repo.countRecentByPhone.mockResolvedValue(0);
    repo.findLatestByPhoneAndPurpose.mockResolvedValue(null);
    repo.invalidateActiveByPhoneAndPurpose.mockResolvedValue(0);
    repo.create.mockImplementation(async (data: any) => otpRecord(data.phone, data.codeHash, { lastSentAt: data.lastSentAt }));
    service = new OtpService(repo as any, new PhoneService());
  });

  it.each(INTL_NUMBERS)('crée un OTP pour $label en stockant la forme E.164', async ({ e164 }) => {
    const result = await service.createOtp({
      phone: e164,
      purpose: OtpPurpose.PHONE_VERIFICATION,
    });

    expect(result.code).toMatch(/^\d{6}$/);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ phone: e164 }));
    expect(repo.findLatestByPhoneAndPurpose).toHaveBeenCalledWith(
      e164,
      OtpPurpose.PHONE_VERIFICATION
    );
    expect(repo.invalidateActiveByPhoneAndPurpose).toHaveBeenCalledWith(
      e164,
      OtpPurpose.PHONE_VERIFICATION
    );
  });

  it.each(INTL_NUMBERS)('crée un OTP pour $label depuis une saisie non normalisée', async ({ e164, variants }) => {
    for (const variant of variants) {
      vi.clearAllMocks();
      repo.countRecentByPhone.mockResolvedValue(0);
      repo.findLatestByPhoneAndPurpose.mockResolvedValue(null);
      repo.create.mockImplementation(async (data: any) =>
        otpRecord(data.phone, data.codeHash, { lastSentAt: data.lastSentAt })
      );

      await service.createOtp({ phone: variant, purpose: OtpPurpose.PHONE_VERIFICATION });

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({ phone: e164 }));
    }
  });

  it('ne stocke que le hash du code, jamais le code en clair', async () => {
    const { code } = await service.createOtp({
      phone: '+33612345678',
      purpose: OtpPurpose.PHONE_VERIFICATION,
    });

    const stored = repo.create.mock.calls[0][0] as any;
    expect(stored.codeHash).not.toBe(code);
    expect(stored.codeHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored).not.toHaveProperty('code');
  });

  it.each(INTL_NUMBERS)('resend $label : invalide l\'OTP actif et génère un nouveau code', async ({ e164 }) => {
    const previous = otpRecord(e164, 'previous-hash', {
      id: 'otp-previous',
      lastSentAt: new Date(Date.now() - 10 * 60 * 1000),
    });
    repo.findLatestByPhoneAndPurpose.mockResolvedValue(previous);
    repo.invalidateActiveByPhoneAndPurpose.mockResolvedValue(1);

    const result = await service.resendOtp({
      phone: e164,
      purpose: OtpPurpose.PHONE_VERIFICATION,
      ip: '203.0.113.10',
    });

    expect(result.code).toMatch(/^\d{6}$/);
    expect(repo.invalidateActiveByPhoneAndPurpose).toHaveBeenCalledWith(
      e164,
      OtpPurpose.PHONE_VERIFICATION
    );
    expect(repo.create).toHaveBeenCalledTimes(1);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({ phone: e164, purpose: OtpPurpose.PHONE_VERIFICATION })
    );
  });

  it.each(INTL_NUMBERS)('resend $label : rejette une demande avant la fin du cooldown', async ({ e164 }) => {
    repo.findLatestByPhoneAndPurpose.mockResolvedValue(
      otpRecord(e164, 'hash', { lastSentAt: new Date(Date.now() - 2000) })
    );

    await expect(
      service.resendOtp({ phone: e164, purpose: OtpPurpose.PHONE_VERIFICATION, ip: '203.0.113.10' })
    ).rejects.toThrow(OtpResendCooldownError);
    expect(repo.create).not.toHaveBeenCalled();
  });

  it.each(INTL_NUMBERS)('verify $label : accepte le bon code et marque l\'OTP utilisé', async ({ e164 }) => {
    const { createHash } = await import('node:crypto');
    const code = '123456';
    const codeHash = createHash('sha256').update(code).digest('hex');
    repo.findLatestActiveByPhoneAndPurpose.mockResolvedValue(
      otpRecord(e164, codeHash, { id: 'otp-active' })
    );
    repo.markUsed.mockResolvedValue({});

    await expect(
      service.verifyOtp({ phone: e164, code, purpose: OtpPurpose.PHONE_VERIFICATION })
    ).resolves.toBe(true);

    expect(repo.findLatestActiveByPhoneAndPurpose).toHaveBeenCalledWith(
      e164,
      OtpPurpose.PHONE_VERIFICATION
    );
    expect(repo.markUsed).toHaveBeenCalledWith('otp-active');
  });

  it.each(INTL_NUMBERS)('verify $label : rejette un mauvais code et incrémente les tentatives', async ({ e164 }) => {
    const { createHash } = await import('node:crypto');
    const codeHash = createHash('sha256').update('123456').digest('hex');
    repo.findLatestActiveByPhoneAndPurpose.mockResolvedValue(
      otpRecord(e164, codeHash, { id: 'otp-active' })
    );
    repo.incrementAttempts.mockResolvedValue({ attemptCount: 1 });

    await expect(
      service.verifyOtp({ phone: e164, code: '000000', purpose: OtpPurpose.PHONE_VERIFICATION })
    ).rejects.toThrow(InvalidOtpError);

    expect(repo.incrementAttempts).toHaveBeenCalledWith('otp-active');
    expect(repo.markUsed).not.toHaveBeenCalled();
  });

  it.each(INTL_NUMBERS)('verify $label : rejette un code expiré', async ({ e164 }) => {
    repo.findLatestActiveByPhoneAndPurpose.mockResolvedValue(
      otpRecord(e164, 'hash', { expiresAt: new Date(Date.now() - 1000) })
    );
    repo.markExpired.mockResolvedValue({});

    const { OtpExpiredError } = await import('../../src/common/errors/AppError.js');
    await expect(
      service.verifyOtp({ phone: e164, code: '123456', purpose: OtpPurpose.PHONE_VERIFICATION })
    ).rejects.toThrow(OtpExpiredError);
  });

  it('verify : rejette un code mal formé avant toute requête base', async () => {
    const { AuthService } = await import('../../src/modules/auth/services/AuthService.js');

    const badCodes = ['12345', '1234567', 'abcdef', '12 34 56x'];
    expect.assertions(badCodes.length + 1);

    const authService = new AuthService(
      { findByPhone: vi.fn() } as any,
      service as any,
      new PhoneService(),
      { sendOtp: vi.fn() } as any
    );

    for (const badCode of badCodes) {
      await expect(
        authService.verifyOtp('+33612345678', badCode)
      ).rejects.toThrow(/6-digit/);
    }
    expect(repo.findLatestActiveByPhoneAndPurpose).not.toHaveBeenCalled();
  });

  it.each(INVALID_NUMBERS)('rejette un numéro invalide ($label) avant toute persistance', async ({ value }) => {
    await expect(
      service.createOtp({ phone: value, purpose: OtpPurpose.PHONE_VERIFICATION })
    ).rejects.toThrow(InvalidPhoneError);
    expect(repo.create).not.toHaveBeenCalled();

    await expect(
      service.resendOtp({ phone: value, purpose: OtpPurpose.PHONE_VERIFICATION, ip: '203.0.113.10' })
    ).rejects.toThrow(InvalidPhoneError);

    await expect(
      service.verifyOtp({ phone: value, code: '123456', purpose: OtpPurpose.PHONE_VERIFICATION })
    ).rejects.toThrow(InvalidPhoneError);

    expect(repo.create).not.toHaveBeenCalled();
    expect(repo.findLatestActiveByPhoneAndPurpose).not.toHaveBeenCalled();
  });

  it('le verrou par téléphone est bien cloisonné par numéro normalisé', async () => {
    // Deux numéros différents ne doivent jamais partager un verrou.
    const seen: string[] = [];
    repo.findLatestActiveByPhoneAndPurpose.mockImplementation(async (phone: string) => {
      seen.push(phone);
      return null;
    });

    await expect(
      service.verifyOtp({ phone: '+22890123456', code: '111111', purpose: OtpPurpose.PHONE_VERIFICATION })
    ).rejects.toThrow(InvalidOtpError);
    await expect(
      service.verifyOtp({ phone: '+33612345678', code: '111111', purpose: OtpPurpose.PHONE_VERIFICATION })
    ).rejects.toThrow(InvalidOtpError);

    expect(seen).toEqual(['+22890123456', '+33612345678']);
  });
});
