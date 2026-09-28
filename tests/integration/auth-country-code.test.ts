import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import request from 'supertest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://user:password@localhost:5432/gamalone_test';
  process.env.SMS_PROVIDER = 'mock';
  // Ce fichier enchaîne plus de 20 envois d'OTP depuis la même IP.
  process.env.OTP_RATE_LIMIT_PER_IP = '10000';
  process.env.OTP_RATE_LIMIT_PER_PHONE = '10000';
});

/**
 * Parcours HTTP de bout en bout avec le nouveau contrat `countryCode` + `phone`.
 *
 * L'application Express, `PhoneService`, `OtpService`, `AuthService` et
 * `AuthRepository` sont les VRAIS. Seules la base et le fournisseur SMS sont
 * simulés, ce qui permet de vérifier que la composition E.164 est effective
 * avant tout accès base, et que le `User.telephone` persisté est bien l'E.164.
 */

const sentSms = vi.fn();

vi.mock('../../src/config/sms-factory.js', () => ({
  createSmsService: () => ({
    sendOtp: sentSms,
    sendNotification: vi.fn(),
  }),
}));

type StoredUser = Record<string, any>;
type StoredOtp = Record<string, any>;

const users: StoredUser[] = [];
const otpCodes: StoredOtp[] = [];
let userSeq = 0;
let otpSeq = 0;

function resetStores() {
  users.length = 0;
  otpCodes.length = 0;
  userSeq = 0;
  otpSeq = 0;
}

const fakePrisma: any = {
  user: {
    findUnique: vi.fn(async ({ where }: any) => {
      if (where.telephone) return users.find((u) => u.telephone === where.telephone) ?? null;
      if (where.email) return users.find((u) => u.email === where.email) ?? null;
      if (where.username) return users.find((u) => u.username === where.username) ?? null;
      if (where.id) return users.find((u) => u.id === where.id) ?? null;
      return null;
    }),
    create: vi.fn(async ({ data }: any) => {
      if (users.some((u) => u.telephone === data.telephone)) {
        const err: any = new Error('Unique constraint failed');
        err.code = 'P2002';
        throw err;
      }
      const user = {
        id: `user-${++userSeq}`,
        email: null,
        username: null,
        nom: null,
        motDePasse: null,
        telephoneVerifiedAt: null,
        ...data,
      };
      users.push(user);
      return user;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const user = users.find((u) => u.id === where.id);
      if (!user) throw new Error('User not found');
      Object.assign(user, data);
      return user;
    }),
  },

  otpCode: {
    create: vi.fn(async ({ data }: any) => {
      const record = {
        id: `otp-${++otpSeq}`,
        status: 'EN_ATTENTE',
        attemptCount: 0,
        usedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data,
      };
      otpCodes.push(record);
      return record;
    }),
    findFirst: vi.fn(async ({ where }: any) => {
      const now = new Date();
      const matches = otpCodes
        .filter((o) => (where.phone === undefined || o.phone === where.phone))
        .filter((o) => (where.purpose === undefined || o.purpose === where.purpose))
        .filter((o) => (where.status === undefined || o.status === where.status))
        .filter((o) => (where.expiresAt === undefined || o.expiresAt > now))
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return matches[0] ?? null;
    }),
    update: vi.fn(async ({ where, data }: any) => {
      const record = otpCodes.find((o) => o.id === where.id);
      if (!record) throw new Error('OTP not found');
      if (typeof data.attemptCount === 'object') {
        record.attemptCount += data.attemptCount.increment;
      } else {
        Object.assign(record, data);
      }
      return record;
    }),
    updateMany: vi.fn(async ({ where, data }: any) => {
      const now = new Date();
      let count = 0;
      for (const o of otpCodes) {
        if (o.phone !== where.phone || o.purpose !== where.purpose) continue;
        if (where.status !== undefined && o.status !== where.status) continue;
        if (where.expiresAt !== undefined && !(o.expiresAt > now)) continue;
        Object.assign(o, data);
        count += 1;
      }
      return { count };
    }),
    count: vi.fn(async ({ where }: any) => {
      return otpCodes.filter(
        (o) =>
          o.phone === where.phone &&
          (where.createdAt === undefined || o.createdAt >= where.createdAt.gte)
      ).length;
    }),
  },

  artisanProfile: { create: vi.fn(async () => ({})) },
  buyerProfile: { create: vi.fn(async () => ({})) },
  adminProfile: { findUnique: vi.fn(async () => null) },
};

fakePrisma.$transaction = vi.fn(async (fn: any) => fn(fakePrisma));

vi.mock('../../src/config/database.js', () => ({ prisma: fakePrisma }));

vi.mock('../../src/modules/kyc/kyc.factory.js', () => ({
  createKycModule: () => ({
    controller: {
      submit: vi.fn(), resubmit: vi.fn(), getMine: vi.fn(), getById: vi.fn(),
      uploadDocument: vi.fn(), getDocuments: vi.fn(), deleteDocument: vi.fn(),
      listPendingReviews: vi.fn(), runPurge: vi.fn(), getReviewHistory: vi.fn(),
      getAdminDetailsById: vi.fn(), approve: vi.fn(), reject: vi.fn(),
      requestCorrection: vi.fn(), setLegalHold: vi.fn(), anonymize: vi.fn(),
    },
  }),
}));

const PASSWORD = 'S3cretPassword!';
let PASSWORD_HASH = '';

/** Les trois pays exigés par la spécification. */
const CASES = [
  { label: '+228 (Togo)', countryCode: '+228', phone: '90123456', e164: '+22890123456' },
  { label: '+33 (France)', countryCode: '+33', phone: '612345678', e164: '+33612345678' },
  { label: '+1 (US)', countryCode: '+1', phone: '2125551234', e164: '+12125551234' },
] as const;

const app = (await import('../../src/app.js')).default;
const { PasswordService } = await import('../../src/modules/auth/services/PasswordService.js');

PASSWORD_HASH = await new PasswordService().hash(PASSWORD);

function lastOtpCodeFor(phone: string): string {
  const call = [...sentSms.mock.calls].reverse().find((c) => c[0] === phone);
  if (!call) throw new Error(`Aucun SMS envoyé pour ${phone}`);
  return call[1] as string;
}

function ageLastOtp(phone: string) {
  for (const o of otpCodes) {
    if (o.phone === phone) {
      o.lastSentAt = new Date(Date.now() - 10 * 60 * 1000);
      o.createdAt = new Date(Date.now() - 10 * 60 * 1000);
    }
  }
}

function seedVerifiedUser(phone: string) {
  users.push({
    id: `seed-${phone}`,
    email: null,
    username: null,
    nom: 'Awa Mensah',
    motDePasse: PASSWORD_HASH,
    telephone: phone,
    role: 'ACHETEUR',
    statut: 'ACTIF',
    telephoneVerificationStatus: 'VERIFIE',
    telephoneVerifiedAt: new Date(),
  });
}

describe('Contrat countryCode + phone (HTTP)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStores();
  });

  describe('POST /api/v1/auth/otp/send', () => {
    it.each(CASES)('compose $label et persiste l\'E.164', async ({ countryCode, phone, e164 }) => {
      const res = await request(app)
        .post('/api/v1/auth/otp/send')
        .send({ countryCode, phone });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const stored = otpCodes.find((o) => o.phone === e164);
      expect(stored).toBeDefined();
      // Le numéro national brut ne doit JAMAIS être stocké.
      expect(otpCodes.some((o) => o.phone === phone)).toBe(false);
      expect(stored!.codeHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it.each(CASES)('envoie le SMS au fournisseur en E.164 pour $label', async ({
      countryCode,
      phone,
      e164,
    }) => {
      await request(app).post('/api/v1/auth/otp/send').send({ countryCode, phone });
      expect(sentSms).toHaveBeenCalledWith(e164, expect.stringMatching(/^\d{6}$/));
    });

    it('accepte un countryCode sans +', async () => {
      const res = await request(app)
        .post('/api/v1/auth/otp/send')
        .send({ countryCode: '33', phone: '612345678' });

      expect(res.status).toBe(200);
      expect(otpCodes.some((o) => o.phone === '+33612345678')).toBe(true);
    });

    it('accepte un numéro national avec séparateurs', async () => {
      const res = await request(app)
        .post('/api/v1/auth/otp/send')
        .send({ countryCode: '+33', phone: '06 12 34 56 78' });

      expect(res.status).toBe(200);
      expect(otpCodes.some((o) => o.phone === '+33612345678')).toBe(true);
    });

    it('reste compatible avec le contrat historique (phone seul)', async () => {
      const res = await request(app).post('/api/v1/auth/otp/send').send({ phone: '+22890123456' });

      expect(res.status).toBe(200);
      expect(otpCodes.some((o) => o.phone === '+22890123456')).toBe(true);
    });

    it.each([
      { countryCode: '+1234', phone: '2125551234', label: 'indicatif > 3 chiffres' },
      { countryCode: 'abc', phone: '612345678', label: 'indicatif non numérique' },
      { countryCode: '+33', phone: '', label: 'numéro vide' },
      { countryCode: '+33', phone: '123', label: 'résultat trop court' },
    ])('rejette : $label (400)', async ({ countryCode, phone }) => {
      const res = await request(app).post('/api/v1/auth/otp/send').send({ countryCode, phone });

      expect(res.status).toBe(400);
      expect(otpCodes).toHaveLength(0);
      expect(sentSms).not.toHaveBeenCalled();
    });

    it('refuse un phone déjà international en plus de countryCode (400)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/otp/send')
        .send({ countryCode: '+33', phone: '+33612345678' });

      expect(res.status).toBe(400);
      expect(otpCodes).toHaveLength(0);
    });

    it('rejette un countryCode sans phone (400)', async () => {
      const res = await request(app).post('/api/v1/auth/otp/send').send({ countryCode: '+33' });

      expect(res.status).toBe(400);
    });

    it('rejette countryCode sans phone sur /otp/resend et /otp/verify (400)', async () => {
      const resend = await request(app).post('/api/v1/auth/otp/resend').send({ countryCode: '+33' });
      const verify = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({ countryCode: '+33', code: '123456' });

      expect(resend.status).toBe(400);
      expect(verify.status).toBe(400);
    });
  });

  describe('POST /api/v1/auth/otp/resend', () => {
    it.each(CASES)('renvoie un code pour $label', async ({ countryCode, phone, e164 }) => {
      await request(app).post('/api/v1/auth/otp/send').send({ countryCode, phone });
      const firstCode = lastOtpCodeFor(e164);

      ageLastOtp(e164);
      const res = await request(app).post('/api/v1/auth/otp/resend').send({ countryCode, phone });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('OTP resent');
      expect(res.body).not.toHaveProperty('otp');

      const active = otpCodes.filter((o) => o.phone === e164 && o.status === 'EN_ATTENTE');
      expect(active).toHaveLength(1);
      const firstHash = createHash('sha256').update(firstCode).digest('hex');
      expect(active[0].codeHash).not.toBe(firstHash);
    });

    it('compose le même E.164 au resend qu\'au send initial', async () => {
      const send = await request(app)
        .post('/api/v1/auth/otp/send')
        .send({ countryCode: '+33', phone: '612345678' });
      expect(send.status).toBe(200);

      ageLastOtp('+33612345678');
      const resend = await request(app)
        .post('/api/v1/auth/otp/resend')
        .send({ countryCode: '+33', phone: '612345678' });
      expect(resend.status).toBe(200);

      // Un seul numéro en base : le resend n'a pas créé de doublon.
      expect(new Set(otpCodes.map((o) => o.phone)).size).toBe(1);
    });

    it('refuse un resend avant la fin du cooldown', async () => {
      await request(app).post('/api/v1/auth/otp/send').send({ countryCode: '+228', phone: '90123456' });

      const res = await request(app)
        .post('/api/v1/auth/otp/resend')
        .send({ countryCode: '+228', phone: '90123456' });

      expect(res.status).toBe(429);
      expect(res.body.code).toBe('OTP_RESEND_COOLDOWN');
    });
  });

  describe('POST /api/v1/auth/otp/verify', () => {
    it.each(CASES)('vérifie $label et renvoie un jeton', async ({ countryCode, phone, e164 }) => {
      await request(app).post('/api/v1/auth/otp/send').send({ countryCode, phone });
      const code = lastOtpCodeFor(e164);

      const res = await request(app).post('/api/v1/auth/otp/verify').send({ countryCode, phone, code });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeTruthy();
      expect(res.body.user.telephone).toBe(e164);
      expect(res.body.user.telephoneVerificationStatus).toBe('VERIFIE');
      expect(otpCodes.find((o) => o.phone === e164)!.status).toBe('UTILISE');
    });

    it('le numéro créé en base est l\'E.164, pas le national', async () => {
      await request(app).post('/api/v1/auth/otp/send').send({ countryCode: '+33', phone: '612345678' });
      const code = lastOtpCodeFor('+33612345678');

      await request(app).post('/api/v1/auth/otp/verify').send({ countryCode: '+33', phone: '612345678', code });

      const created = users.find((u) => u.telephone === '+33612345678');
      expect(created).toBeDefined();
      expect(users.some((u) => u.telephone === '612345678')).toBe(false);
    });

    it('accepte countryCode avec un countryCode sans +', async () => {
      await request(app).post('/api/v1/auth/otp/send').send({ countryCode: '1', phone: '2125551234' });
      const code = lastOtpCodeFor('+12125551234');

      const res = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({ countryCode: '1', phone: '2125551234', code });

      expect(res.status).toBe(200);
    });

    it('rejette un mauvais code (400)', async () => {
      await request(app).post('/api/v1/auth/otp/send').send({ countryCode: '+33', phone: '612345678' });

      const res = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({ countryCode: '+33', phone: '612345678', code: '000000' });

      expect(res.status).toBe(400);
      expect(otpCodes.find((o) => o.phone === '+33612345678')!.attemptCount).toBe(1);
    });

    it('un code +33 ne valide pas un numéro +228', async () => {
      await request(app).post('/api/v1/auth/otp/send').send({ countryCode: '+33', phone: '612345678' });
      const code = lastOtpCodeFor('+33612345678');

      const res = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({ countryCode: '+228', phone: '90123456', code });

      expect(res.status).toBe(400);
    });

    it.each(['12345', '1234567', 'abcdef'])('rejette un code mal formé %j (400)', async (code) => {
      await request(app).post('/api/v1/auth/otp/send').send({ countryCode: '+33', phone: '612345678' });

      const res = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({ countryCode: '+33', phone: '612345678', code });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/auth/verify-phone', () => {
    it.each(CASES)('vérifie un compte existant pour $label', async ({ countryCode, phone, e164 }) => {
      seedVerifiedUser(e164);
      await request(app).post('/api/v1/auth/otp/send').send({ countryCode, phone });
      const code = lastOtpCodeFor(e164);

      const res = await request(app)
        .post('/api/v1/auth/verify-phone')
        .send({ countryCode, telephone: phone, code });

      expect(res.status).toBe(200);
      expect(res.body.user.telephone).toBe(e164);
    });

    it('reste compatible avec telephone seul (contrat historique)', async () => {
      seedVerifiedUser('+22890123456');
      await request(app).post('/api/v1/auth/otp/send').send({ phone: '+22890123456' });
      const code = lastOtpCodeFor('+22890123456');

      const res = await request(app)
        .post('/api/v1/auth/verify-phone')
        .send({ telephone: '+22890123456', code });

      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/v1/auth/register', () => {
    it.each(CASES)('inscrit un acheteur $label et stocke l\'E.164', async ({
      countryCode,
      phone,
      e164,
    }) => {
      const res = await request(app).post('/api/v1/auth/register').send({
        role: 'ACHETEUR',
        nom: 'Awa Mensah',
        countryCode,
        telephone: phone,
        motDePasse: PASSWORD,
      });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      const created = users.find((u) => u.telephone === e164);
      expect(created).toBeDefined();
      expect(created!.telephoneVerificationStatus).toBe('NON_VERIFIE');
      expect(otpCodes.some((o) => o.phone === e164)).toBe(true);
      // Le pays n'est PAS stocké séparément.
      expect(created).not.toHaveProperty('countryCode');
    });

    it('inscrit un artisan international', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        role: 'ARTISAN',
        nom: 'Marie Dupont',
        countryCode: '+33',
        telephone: '612345678',
        motDePasse: PASSWORD,
        specialite: 'Céramique',
        localisation: 'Paris',
      });

      expect(res.status).toBe(201);
      expect(users.some((u) => u.telephone === '+33612345678' && u.role === 'ARTISAN')).toBe(true);
    });

    it('reste compatible avec telephone seul (contrat historique)', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        role: 'ACHETEUR',
        nom: 'Awa Mensah',
        telephone: '+22890123456',
        motDePasse: PASSWORD,
      });

      expect(res.status).toBe(201);
      expect(users.some((u) => u.telephone === '+22890123456')).toBe(true);
    });

    it('détecte un doublon entre les deux syntaxes', async () => {
      await request(app).post('/api/v1/auth/register').send({
        role: 'ACHETEUR',
        nom: 'Awa',
        countryCode: '+228',
        telephone: '90123456',
        motDePasse: PASSWORD,
      });

      const res = await request(app).post('/api/v1/auth/register').send({
        role: 'ACHETEUR',
        nom: 'Awa',
        telephone: '+22890123456',
        motDePasse: PASSWORD,
      });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CONFLICT');
      expect(users.filter((u) => u.telephone === '+22890123456')).toHaveLength(1);
    });

    it('rejette un countryCode invalide (400) sans créer d\'utilisateur', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        role: 'ACHETEUR',
        nom: 'Awa',
        countryCode: '+1234',
        telephone: '2125551234',
        motDePasse: PASSWORD,
      });

      expect(res.status).toBe(400);
      expect(users).toHaveLength(0);
    });

    it('accepte un pays non listé dans nos tests (aucune whitelist en backend)', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        role: 'ACHETEUR',
        nom: 'Kofi',
        countryCode: '+233',
        telephone: '241234567',
        motDePasse: PASSWORD,
      });

      expect(res.status).toBe(201);
      expect(users.some((u) => u.telephone === '+233241234567')).toBe(true);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it.each(CASES)('connecte via countryCode + telephone pour $label', async ({
      countryCode,
      phone,
      e164,
    }) => {
      seedVerifiedUser(e164);

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ countryCode, telephone: phone, motDePasse: PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeTruthy();
      expect(res.body.user.telephone).toBe(e164);
    });

    it('reste compatible avec telephone seul (contrat historique)', async () => {
      seedVerifiedUser('+33612345678');

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ telephone: '+33612345678', motDePasse: PASSWORD });

      expect(res.status).toBe(200);
    });

    it('reste compatible avec identifier email', async () => {
      users.push({
        id: 'user-email',
        email: 'awa@example.com',
        username: null,
        nom: 'Awa',
        motDePasse: PASSWORD_HASH,
        telephone: '+33612345678',
        role: 'ACHETEUR',
        statut: 'ACTIF',
        telephoneVerificationStatus: 'VERIFIE',
        telephoneVerifiedAt: new Date(),
      });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ identifier: 'Awa@Example.com', motDePasse: PASSWORD });

      expect(res.status).toBe(200);
    });

    it('rejette countryCode combiné à identifier (400)', async () => {
      const res = await request(app).post('/api/v1/auth/login').send({
        countryCode: '+33',
        identifier: 'g.apedo',
        motDePasse: PASSWORD,
      });

      expect(res.status).toBe(400);
    });

    it('rejette countryCode sans telephone (400)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ countryCode: '+33', motDePasse: PASSWORD });

      expect(res.status).toBe(400);
    });

    it('rejette un numéro international inexistant (401)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ countryCode: '+33', telephone: '612345678', motDePasse: PASSWORD });

      expect(res.status).toBe(401);
    });

    it('rejette un mauvais mot de passe (401)', async () => {
      seedVerifiedUser('+33612345678');

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ countryCode: '+33', telephone: '612345678', motDePasse: 'MauvaisMotDePasse1' });

      expect(res.status).toBe(401);
    });
  });

  describe('Cohérence bout en bout : send -> verify -> login', () => {
    it.each(CASES)('parcours complet $label', async ({ countryCode, phone, e164 }) => {
      // 1. Inscription
      const register = await request(app).post('/api/v1/auth/register').send({
        role: 'ACHETEUR',
        nom: 'Awa Mensah',
        countryCode,
        telephone: phone,
        motDePasse: PASSWORD,
      });
      expect(register.status).toBe(201);

      // 2. Vérification OTP
      const code = lastOtpCodeFor(e164);
      const verify = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({ countryCode, phone, code });
      expect(verify.status).toBe(200);

      // 3. Connexion par mot de passe, même syntaxe
      users.find((u) => u.telephone === e164)!.statut = 'ACTIF';
      const login = await request(app)
        .post('/api/v1/auth/login')
        .send({ countryCode, telephone: phone, motDePasse: PASSWORD });
      expect(login.status).toBe(200);
      expect(login.body.user.telephone).toBe(e164);
    });
  });
});
