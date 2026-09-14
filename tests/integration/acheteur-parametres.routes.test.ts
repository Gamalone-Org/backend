import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { ForbiddenError, UnauthorizedError } from '../../src/common/errors/AppError.js';

const mockGetParametres = vi.fn();
const mockUpdateParametres = vi.fn();

vi.mock('../../src/modules/buyer-settings/buyer-settings.service.js', () => ({
  BuyerSettingsService: class {
    getParametres = mockGetParametres;
    updateParametres = mockUpdateParametres;
  },
}));

vi.mock('../../src/shared/services/cloudinary/index.js', () => ({
  CloudinaryService: class {
    uploadDocument = vi.fn();
    deleteAsset = vi.fn();
    getMetadata = vi.fn();
    generateSignedUrl = vi.fn();
  },
}));

vi.mock('../../src/modules/kyc/kyc.factory.js', () => ({
  createKycModule: () => ({
    controller: {
      submit: vi.fn(),
      resubmit: vi.fn(),
      getMine: vi.fn(),
      getById: vi.fn(),
      uploadDocument: vi.fn(),
      getDocuments: vi.fn(),
      deleteDocument: vi.fn(),
      listPendingReviews: vi.fn(),
      runPurge: vi.fn(),
      getReviewHistory: vi.fn(),
      getAdminDetailsById: vi.fn(),
      approve: vi.fn(),
      reject: vi.fn(),
      requestCorrection: vi.fn(),
      setLegalHold: vi.fn(),
      anonymize: vi.fn(),
    },
  }),
}));

vi.mock('../../src/modules/auth/middleware/auth.middleware.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    const authorization = req.headers.authorization;
    if (!authorization || !authorization.startsWith('Bearer ')) {
      next(new UnauthorizedError('Missing or invalid bearer token'));
      return;
    }

    req.user = {
      id: req.headers['x-test-user-id'] ?? 'acheteur-1',
      role: req.headers['x-test-role'] ?? 'ACHETEUR',
      telephone: '+22890123456',
      statut: 'ACTIF',
    };
    next();
  },
  requireRole: (...roles: string[]) => (req: any, _res: any, next: any) => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new ForbiddenError('Insufficient permissions'));
      return;
    }
    next();
  },
  requireAdminLevel: () => (_req: any, _res: any, next: any) => next(),
  requirePermission: (...permissions: string[]) => (_req: any, _res: any, next: any) => next(),
}));

const app = (await import('../../src/app.js')).default;

const AUTH = { Authorization: 'Bearer test-token' };

const parametresBody = {
  langue: 'fr',
  devise: 'XOF',
  notifications: { email: false, sms: false, push: false },
};

describe('Acheteur parametres routes (Integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetParametres.mockResolvedValue(parametresBody);
    mockUpdateParametres.mockResolvedValue(parametresBody);
  });

  it('GET /api/v1/acheteur/parametres without token returns 401', async () => {
    const res = await request(app).get('/api/v1/acheteur/parametres');
    expect(res.status).toBe(401);
    expect(mockGetParametres).not.toHaveBeenCalled();
  });

  it('GET with ARTISAN returns 403', async () => {
    const res = await request(app)
      .get('/api/v1/acheteur/parametres')
      .set('Authorization', 'Bearer test-token')
      .set('x-test-role', 'ARTISAN');
    expect(res.status).toBe(403);
    expect(mockGetParametres).not.toHaveBeenCalled();
  });

  it('GET with ADMIN returns 403', async () => {
    const res = await request(app)
      .get('/api/v1/acheteur/parametres')
      .set('Authorization', 'Bearer test-token')
      .set('x-test-role', 'ADMIN');
    expect(res.status).toBe(403);
    expect(mockGetParametres).not.toHaveBeenCalled();
  });

  it('GET with ACHETEUR returns 200 with the full parametres structure', async () => {
    const res = await request(app).get('/api/v1/acheteur/parametres').set(AUTH);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.parametres).toEqual(parametresBody);
    expect(mockGetParametres).toHaveBeenCalledWith('acheteur-1');
  });

  it('GET response exposes langue, devise and notifications (structure)', async () => {
    const res = await request(app).get('/api/v1/acheteur/parametres').set(AUTH);

    expect(res.body.parametres.langue).toBe('fr');
    expect(res.body.parametres.devise).toBe('XOF');
    expect(res.body.parametres.notifications).toHaveProperty('email', false);
    expect(res.body.parametres.notifications).toHaveProperty('sms', false);
    expect(res.body.parametres.notifications).toHaveProperty('push', false);
  });

  it('PATCH langue updates the buyer settings', async () => {
    mockUpdateParametres.mockResolvedValue({ ...parametresBody, langue: 'en' });

    const res = await request(app)
      .patch('/api/v1/acheteur/parametres')
      .set(AUTH)
      .send({ langue: 'en' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBeDefined();
    expect(res.body.parametres.langue).toBe('en');
    expect(mockUpdateParametres).toHaveBeenCalledWith('acheteur-1', { langue: 'en' });
  });

  it('PATCH devise updates the display currency', async () => {
    mockUpdateParametres.mockResolvedValue({ ...parametresBody, devise: 'EUR' });

    const res = await request(app)
      .patch('/api/v1/acheteur/parametres')
      .set(AUTH)
      .send({ devise: 'EUR' });

    expect(res.status).toBe(200);
    expect(res.body.parametres.devise).toBe('EUR');
    expect(mockUpdateParametres).toHaveBeenCalledWith('acheteur-1', { devise: 'EUR' });
  });

  it('PATCH notifications updates the notification preferences', async () => {
    mockUpdateParametres.mockResolvedValue({
      ...parametresBody,
      notifications: { email: true, sms: false, push: false },
    });

    const res = await request(app)
      .patch('/api/v1/acheteur/parametres')
      .set(AUTH)
      .send({ notifications: { email: true } });

    expect(res.status).toBe(200);
    expect(res.body.parametres.notifications.email).toBe(true);
    expect(mockUpdateParametres).toHaveBeenCalledWith('acheteur-1', {
      notifications: { email: true },
    });
  });

  it('PATCH partial: only the provided field is forwarded', async () => {
    const res = await request(app)
      .patch('/api/v1/acheteur/parametres')
      .set(AUTH)
      .send({ devise: 'USD' });

    expect(res.status).toBe(200);
    expect(mockUpdateParametres).toHaveBeenCalledWith('acheteur-1', { devise: 'USD' });
  });

  it('PATCH invalid language value returns 400', async () => {
    const res = await request(app)
      .patch('/api/v1/acheteur/parametres')
      .set(AUTH)
      .send({ langue: 'de' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(mockUpdateParametres).not.toHaveBeenCalled();
  });

  it('PATCH invalid notifications type returns 400', async () => {
    const res = await request(app)
      .patch('/api/v1/acheteur/parametres')
      .set(AUTH)
      .send({ notifications: { email: 'yes' } });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(mockUpdateParametres).not.toHaveBeenCalled();
  });

  it('PATCH unknown fields (acheteurId / buyerProfileId / userId) are rejected (strict) → 400', async () => {
    const res = await request(app)
      .patch('/api/v1/acheteur/parametres')
      .set(AUTH)
      .send({ acheteurId: 'acheteur-EVIL', langue: 'en' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(mockUpdateParametres).not.toHaveBeenCalled();
  });

  it('PATCH empty body returns 400', async () => {
    const res = await request(app).patch('/api/v1/acheteur/parametres').set(AUTH).send({});

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(mockUpdateParametres).not.toHaveBeenCalled();
  });

  it('PATCH empty notifications object returns 400', async () => {
    const res = await request(app)
      .patch('/api/v1/acheteur/parametres')
      .set(AUTH)
      .send({ notifications: {} });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(mockUpdateParametres).not.toHaveBeenCalled();
  });

  it('ownership: the buyer identity always comes from the token, never from the body', async () => {
    const evilBody = {
      acheteurId: 'acheteur-EVIL',
      buyerProfileId: 'acheteur-EVIL',
      userId: 'acheteur-EVIL',
      devise: 'EUR',
    };

    const res = await request(app)
      .patch('/api/v1/acheteur/parametres')
      .set({ ...AUTH, 'x-test-user-id': 'acheteur-A' })
      .send(evilBody);

    // Validation stricte : les identifiants dans le body sont rejetés (400),
    // le service n'est jamais appelé avec autre chose que req.user.id.
    expect(res.status).toBe(400);
    expect(mockUpdateParametres).not.toHaveBeenCalled();

    const resOk = await request(app)
      .patch('/api/v1/acheteur/parametres')
      .set({ ...AUTH, 'x-test-user-id': 'acheteur-A' })
      .send({ devise: 'EUR' });

    expect(resOk.status).toBe(200);
    expect(mockUpdateParametres).toHaveBeenCalledWith('acheteur-A', { devise: 'EUR' });
    expect(mockUpdateParametres.mock.calls[0]).not.toContain('acheteur-EVIL');
  });

  it('ownership: GET resolves the buyer from the token user', async () => {
    const res = await request(app)
      .get('/api/v1/acheteur/parametres')
      .set({ ...AUTH, 'x-test-user-id': 'acheteur-B' });

    expect(res.status).toBe(200);
    expect(mockGetParametres).toHaveBeenCalledWith('acheteur-B');
  });
});