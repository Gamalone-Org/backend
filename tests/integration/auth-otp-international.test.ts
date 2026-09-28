import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import request from 'supertest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://user:password@localhost:5432/gamalone_test';
  // Le rate limiting OTP est volontairement neutralisÃ© : ce fichier enchaÃ®ne
  // bien plus de 20 envois qu'un utilisateur rÃ©el, tous depuis la mÃªme IP.
  // Les seuils eux-mÃªmes sont couverts par tests/unit/otp-service.test.ts et
  // tests/unit/auth-security.test.ts.
  process.env.OTP_RATE_LIMIT_PER_IP = '10000';
  process.env.OTP_RATE_LIMIT_PER_PHONE = '10000';
});

/**
 * Parcours OTP / inscription / connexion de bout en bout sur l'application
 * Express rÃ©elle, avec les VRAIS PhoneService, OtpService, AuthService,
 * AuthRepository et OtpRepository â€” seule la base et le fournisseur SMS sont
 * simulÃ©s. Cela vÃ©rifie que la normalisation E.164 est effectivement appliquÃ©e
 * avant tout accÃ¨s base, y compris pour des numÃ©ros non togolais.
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

const TOGO = '+22890123456';
const FRANCE = '+33612345678';
const USA = '+12125551234';

const app = (await import('../../src/app.js')).default;
const { PasswordService } = await import('../../src/modules/auth/services/PasswordService.js');

// Hash scrypt réel : la comparaison de mot de passe est exercée pour de vrai.
PASSWORD_HASH = await new PasswordService().hash(PASSWORD);

/** Dernier code OTP effectivement remis au fournisseur SMS. */
function lastOtpCodeFor(phone: string): string {
  const call = [...sentSms.mock.calls].reverse().find((c) => c[0] === phone);
  if (!call) throw new Error(`Aucun SMS envoyÃ© pour ${phone}`);
  return call[1] as string;
}

/** LibÃ¨re le cooldown en rÃ©tro-datant le dernier envoi pour ce numÃ©ro. */
function ageLastOtp(phone: string) {
  for (const o of otpCodes) {
    if (o.phone === phone) {
      o.lastSentAt = new Date(Date.now() - 10 * 60 * 1000);
      o.createdAt = new Date(Date.now() - 10 * 60 * 1000);
    }
  }
}

/** NumÃ©ro dÃ©jÃ  vÃ©rifiÃ©, prÃªt pour la connexion par mot de passe. */
function seedVerifiedUser(phone: string, motDePasseHash: string) {
  users.push({
    id: `seed-${phone}`,
    email: null,
    username: null,
    nom: 'Awa Mensah',
    motDePasse: motDePasseHash,
    telephone: phone,
    role: 'ACHETEUR',
    statut: 'ACTIF',
    telephoneVerificationStatus: 'VERIFIE',
    telephoneVerifiedAt: new Date(),
  });
}

describe('Parcours OTP / inscription / connexion — numéros internationaux (HTTP)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStores();
  });

  describe('POST /api/v1/auth/otp/send', () => {
    it.each([
      { label: '+228 (Togo)', phone: TOGO },
      { label: '+33 (France)', phone: FRANCE },
      { label: '+1 (US)', phone: USA },
    ])('accepte un numÃ©ro $label et le persiste en E.164', async ({ phone }) => {
      const res = await request(app).post('/api/v1/auth/otp/send').send({ phone });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.expiresAt).toBeTruthy();
      expect(res.body).not.toHaveProperty('otp');

      const stored = otpCodes.find((o) => o.phone === phone);
      expect(stored).toBeDefined();
      expect(stored!.phone).toBe(phone);
      // Le code n'est jamais stockÃ© en clair, et n'est pas renvoyÃ© au client.
      expect(stored!.codeHash).toMatch(/^[a-f0-9]{64}$/);
    });

    it.each([
      { label: '+33 avec espaces', input: '+33 6 12 34 56 78', expected: FRANCE },
      { label: '+33 avec 00', input: '0033612345678', expected: FRANCE },
      { label: '+1 avec parenthÃ¨ses', input: '+1 (212) 555-1234', expected: USA },
      { label: '+1 avec 00', input: '0012125551234', expected: USA },
      { label: '+228 avec tirets', input: '+228-90-12-34-56', expected: TOGO },
    ])('normalise une saisie $label avant persistance', async ({ input, expected }) => {
      const res = await request(app).post('/api/v1/auth/otp/send').send({ phone: input });

      expect(res.status).toBe(200);
      expect(otpCodes.some((o) => o.phone === expected)).toBe(true);
      expect(otpCodes.some((o) => o.phone === input)).toBe(false);
      // Le SMS est envoyÃ© au fournisseur avec la forme E.164 canonique.
      expect(sentSms).toHaveBeenCalledWith(expected, expect.stringMatching(/^\d{6}$/));
    });

    it('rejette un numÃ©ro invalide (400 INVALID_PHONE) sans rien persister', async () => {
      const res = await request(app).post('/api/v1/auth/otp/send').send({ phone: '+1234567' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_PHONE');
      expect(otpCodes).toHaveLength(0);
      expect(sentSms).not.toHaveBeenCalled();
    });

    it('rejette un numÃ©ro non numÃ©rique (400 INVALID_PHONE)', async () => {
      const res = await request(app).post('/api/v1/auth/otp/send').send({ phone: 'abc' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_PHONE');
      expect(sentSms).not.toHaveBeenCalled();
    });

    it('rejette un champ phone manquant (400)', async () => {
      const res = await request(app).post('/api/v1/auth/otp/send').send({});
      expect(res.status).toBe(400);
      expect(sentSms).not.toHaveBeenCalled();
    });
  });

  describe('POST /api/v1/auth/otp/resend', () => {
    it.each([
      { label: '+228 (Togo)', phone: TOGO },
      { label: '+33 (France)', phone: FRANCE },
      { label: '+1 (US)', phone: USA },
    ])('renvoie un nouveau code pour $label et invalide le prÃ©cÃ©dent', async ({ phone }) => {
      await request(app).post('/api/v1/auth/otp/send').send({ phone });
      const firstCode = lastOtpCodeFor(phone);

      ageLastOtp(phone);
      const res = await request(app).post('/api/v1/auth/otp/resend').send({ phone });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('OTP resent');
      expect(res.body).not.toHaveProperty('otp');

      const active = otpCodes.filter((o) => o.phone === phone && o.status === 'EN_ATTENTE');
      expect(active).toHaveLength(1);
      const secondCode = lastOtpCodeFor(phone);
      expect(secondCode).toMatch(/^\d{6}$/);
      // Le nouveau code ne doit pas correspondre au hash de l'ancien.
      const firstHash = createHash('sha256').update(firstCode).digest('hex');
      expect(active[0].codeHash).not.toBe(firstHash);
    });

    it('refuse un resend avant la fin du cooldown', async () => {
      await request(app).post('/api/v1/auth/otp/send').send({ phone: FRANCE });

      const res = await request(app).post('/api/v1/auth/otp/resend').send({ phone: FRANCE });

      expect(res.status).toBe(429);
      expect(res.body.code).toBe('OTP_RESEND_COOLDOWN');
      expect(otpCodes.filter((o) => o.status === 'EN_ATTENTE')).toHaveLength(1);
    });

    it('rejette un numÃ©ro invalide (400 INVALID_PHONE)', async () => {
      const res = await request(app).post('/api/v1/auth/otp/resend').send({ phone: '++33612345678' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_PHONE');
      expect(otpCodes).toHaveLength(0);
    });
  });

  describe('POST /api/v1/auth/otp/verify', () => {
    it.each([
      { label: '+228 (Togo)', phone: TOGO },
      { label: '+33 (France)', phone: FRANCE },
      { label: '+1 (US)', phone: USA },
    ])('vÃ©rifie un numÃ©ro $label et renvoie un jeton', async ({ phone }) => {
      await request(app).post('/api/v1/auth/otp/send').send({ phone });
      const code = lastOtpCodeFor(phone);

      const res = await request(app).post('/api/v1/auth/otp/verify').send({ phone, code });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeTruthy();
      expect(res.body.tokenType).toBe('Bearer');
      expect(res.body.user.telephone).toBe(phone);
      expect(res.body.user.telephoneVerificationStatus).toBe('VERIFIE');

      const stored = otpCodes.find((o) => o.phone === phone)!;
      expect(stored.status).toBe('UTILISE');
    });

    it('accepte une saisie non normalisÃ©e pour la vÃ©rification', async () => {
      await request(app).post('/api/v1/auth/otp/send').send({ phone: FRANCE });
      const code = lastOtpCodeFor(FRANCE);

      const res = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({ phone: '+33 6 12 34 56 78', code });

      expect(res.status).toBe(200);
      expect(res.body.user.telephone).toBe(FRANCE);
    });

    it('rejette un mauvais code (400) et incrÃ©mente les tentatives', async () => {
      await request(app).post('/api/v1/auth/otp/send').send({ phone: USA });

      const res = await request(app).post('/api/v1/auth/otp/verify').send({ phone: USA, code: '000000' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_OTP');
      const stored = otpCodes.find((o) => o.phone === USA)!;
      expect(stored.attemptCount).toBe(1);
      expect(stored.status).toBe('EN_ATTENTE');
    });

    it('refuse la rÃ©utilisation d\'un code dÃ©jÃ  utilisÃ© (400)', async () => {
      await request(app).post('/api/v1/auth/otp/send').send({ phone: TOGO });
      const code = lastOtpCodeFor(TOGO);
      await request(app).post('/api/v1/auth/otp/verify').send({ phone: TOGO, code });

      const res = await request(app).post('/api/v1/auth/otp/verify').send({ phone: TOGO, code });

      expect(res.status).toBe(400);
    });

    it.each(['12345', '1234567', 'abcdef'])('rejette un code mal formÃ© %j (400)', async (code) => {
      await request(app).post('/api/v1/auth/otp/send').send({ phone: FRANCE });

      const res = await request(app).post('/api/v1/auth/otp/verify').send({ phone: FRANCE, code });

      expect(res.status).toBe(400);
    });

    it('rejette un numÃ©ro invalide (400 INVALID_PHONE)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/otp/verify')
        .send({ phone: '+1234567', code: '123456' });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_PHONE');
    });

    it('ne laisse pas un code +33 valider un numÃ©ro +228', async () => {
      await request(app).post('/api/v1/auth/otp/send').send({ phone: FRANCE });
      const code = lastOtpCodeFor(FRANCE);

      const res = await request(app).post('/api/v1/auth/otp/verify').send({ phone: TOGO, code });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /api/v1/auth/register', () => {
    it.each([
      { label: '+228 (Togo)', phone: TOGO },
      { label: '+33 (France)', phone: FRANCE },
      { label: '+1 (US)', phone: USA },
    ])('inscrit un acheteur $label et dÃ©clenche un OTP', async ({ phone }) => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ role: 'ACHETEUR', nom: 'Awa Mensah', telephone: phone, motDePasse: PASSWORD });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.expiresAt).toBeTruthy();

      const created = users.find((u) => u.telephone === phone);
      expect(created).toBeDefined();
      expect(created!.telephoneVerificationStatus).toBe('NON_VERIFIE');
      expect(created!.statut).toBe('EN_ATTENTE_VALIDATION');
      expect(otpCodes.some((o) => o.phone === phone)).toBe(true);
    });

    it('inscrit un artisan international', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        role: 'ARTISAN',
        nom: 'Marie Dupont',
        telephone: FRANCE,
        motDePasse: PASSWORD,
        specialite: 'CÃ©ramique',
        localisation: 'Paris',
      });

      expect(res.status).toBe(201);
      expect(users.some((u) => u.telephone === FRANCE && u.role === 'ARTISAN')).toBe(true);
      expect(fakePrisma.artisanProfile.create).toHaveBeenCalled();
    });

    it('normalise le numÃ©ro avant de dÃ©tecter un doublon', async () => {
      await request(app)
        .post('/api/v1/auth/register')
        .send({ role: 'ACHETEUR', nom: 'Awa', telephone: '+33612345678', motDePasse: PASSWORD });

      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ role: 'ACHETEUR', nom: 'Awa', telephone: '0033612345678', motDePasse: PASSWORD });

      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CONFLICT');
      expect(users.filter((u) => u.telephone === FRANCE)).toHaveLength(1);
    });

    it('rejette un numÃ©ro invalide (400 INVALID_PHONE) sans crÃ©er d\'utilisateur', async () => {
      const res = await request(app)
        .post('/api/v1/auth/register')
        .send({ role: 'ACHETEUR', nom: 'Awa', telephone: '+1234567', motDePasse: PASSWORD });

      expect(res.status).toBe(400);
      expect(res.body.code).toBe('INVALID_PHONE');
      expect(users).toHaveLength(0);
    });
  });

  describe('POST /api/v1/auth/login', () => {
    it.each([
      { label: '+228 (Togo)', phone: TOGO },
      { label: '+33 (France)', phone: FRANCE },
      { label: '+1 (US)', phone: USA },
    ])('connecte un utilisateur $label via telephone', async ({ phone }) => {
      seedVerifiedUser(phone, PASSWORD_HASH);

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ telephone: phone, motDePasse: PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.accessToken).toBeTruthy();
      expect(res.body.user.telephone).toBe(phone);
      expect(res.body.user.role).toBe('ACHETEUR');
    });

    it.each([
      { label: '+33 espaces', input: '+33 6 12 34 56 78' },
      { label: '+33 00', input: '0033612345678' },
      { label: '+1 parenthÃ¨ses', input: '+1 (212) 555-1234' },
    ])('connecte avec une saisie non normalisÃ©e ($label)', async ({ input }) => {
      seedVerifiedUser(input === '+1 (212) 555-1234' ? USA : FRANCE, PASSWORD_HASH);

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ telephone: input, motDePasse: PASSWORD });

      expect(res.status).toBe(200);
    });

    it('connecte via identifier email sans Ãªtre impactÃ© par la normalisation', async () => {
      users.push({
        id: 'user-email',
        email: 'awa@example.com',
        username: null,
        nom: 'Awa',
        motDePasse: PASSWORD_HASH,
        telephone: FRANCE,
        role: 'ACHETEUR',
        statut: 'ACTIF',
        telephoneVerificationStatus: 'VERIFIE',
        telephoneVerifiedAt: new Date(),
      });

      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ identifier: 'Awa@Example.com', motDePasse: PASSWORD });

      expect(res.status).toBe(200);
      expect(res.body.user.telephone).toBe(FRANCE);
    });

    it('rejette un numÃ©ro international inexistant (401)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ telephone: '+33612345678', motDePasse: PASSWORD });

      expect(res.status).toBe(401);
    });

    it('rejette un numÃ©ro invalide (400 INVALID_PHONE)', async () => {
      const res = await request(app)
        .post('/api/v1/auth/login')
        .send({ telephone: 'abc', motDePasse: PASSWORD });

      expect(res.status).toBe(401);
    });
  });
});
