import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import {
  ForbiddenError,
  UnauthorizedError,
  ConflictError,
  NotFoundError,
} from '../../src/common/errors/AppError.js';

const mockGetMyCommandesArtisan = vi.fn();
const mockGetMyCommandeArtisan = vi.fn();
const mockPreparer = vi.fn();
const mockExpedier = vi.fn();

vi.mock('../../src/modules/orders/order.service.js', () => ({
  OrderService: class {
    getMyCommandesArtisan = mockGetMyCommandesArtisan;
    getMyCommandeArtisan = mockGetMyCommandeArtisan;
    preparer = mockPreparer;
    expedier = mockExpedier;
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
      id: req.headers['x-test-user-id'] ?? 'artisan-1',
      role: req.headers['x-test-role'] ?? 'ARTISAN',
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

const CA_ID = '123e4567-e89b-12d3-a456-426614174222';

describe('Artisan orders routes (Integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetMyCommandesArtisan.mockResolvedValue({
      commandes: [],
      total: 0,
      page: 1,
      limit: 20,
      counts: {},
    });
    mockGetMyCommandeArtisan.mockResolvedValue({ id: CA_ID, statut: 'COMMANDE' });
    mockPreparer.mockResolvedValue({
      commandeArtisan: { id: CA_ID, statut: 'PREPARATION' },
      statutGlobal: 'COMMANDE',
    });
    mockExpedier.mockResolvedValue({
      commandeArtisan: { id: CA_ID, statut: 'EXPEDIEE' },
      statutGlobal: 'EXPEDIEE',
    });
  });

  it('ARTISAN lists only its own orders (200)', async () => {
    const res = await request(app)
      .get('/api/v1/artisan/commandes')
      .set('Authorization', 'Bearer token')
      .set('x-test-user-id', 'artisan-1')
      .set('x-test-role', 'ARTISAN')
      .query({ statut: 'COMMANDE', q: 'awa' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockGetMyCommandesArtisan).toHaveBeenCalledWith('artisan-1', 1, 20, {
      statut: 'COMMANDE',
      q: 'awa',
    });
  });

  it('requires authentication (401)', async () => {
    const res = await request(app).get('/api/v1/artisan/commandes');
    expect(res.status).toBe(401);
    expect(mockGetMyCommandesArtisan).not.toHaveBeenCalled();
  });

  it('ACHETEUR is forbidden from artisan listing (403)', async () => {
    const res = await request(app)
      .get('/api/v1/artisan/commandes')
      .set('Authorization', 'Bearer token')
      .set('x-test-user-id', 'acheteur-1')
      .set('x-test-role', 'ACHETEUR');

    expect(res.status).toBe(403);
    expect(mockGetMyCommandesArtisan).not.toHaveBeenCalled();
  });

  it('rejects an invalid statut filter (400)', async () => {
    const res = await request(app)
      .get('/api/v1/artisan/commandes')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN')
      .query({ statut: 'INVALIDE' });

    expect(res.status).toBe(400);
  });

  it('rejects a limit above 50 (400)', async () => {
    const res = await request(app)
      .get('/api/v1/artisan/commandes')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN')
      .query({ limit: 100 });

    expect(res.status).toBe(400);
  });

  it('ARTISAN gets its own order (200)', async () => {
    const res = await request(app)
      .get(`/api/v1/artisan/commandes/${CA_ID}`)
      .set('Authorization', 'Bearer token')
      .set('x-test-user-id', 'artisan-1')
      .set('x-test-role', 'ARTISAN');

    expect(res.status).toBe(200);
    expect(mockGetMyCommandeArtisan).toHaveBeenCalledWith('artisan-1', CA_ID);
  });

  it('rejects an invalid order id (400)', async () => {
    const res = await request(app)
      .get('/api/v1/artisan/commandes/not-a-uuid')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN');

    expect(res.status).toBe(400);
  });

  it('ARTISAN prepares its order (200)', async () => {
    const res = await request(app)
      .post(`/api/v1/artisan/commandes/${CA_ID}/preparer`)
      .set('Authorization', 'Bearer token')
      .set('x-test-user-id', 'artisan-1')
      .set('x-test-role', 'ARTISAN');

    expect(res.status).toBe(200);
    expect(res.body.commandeArtisan.statut).toBe('PREPARATION');
    expect(res.body.statutGlobal).toBe('COMMANDE');
    expect(mockPreparer).toHaveBeenCalledWith('artisan-1', CA_ID);
  });

  it('ARTISAN ships its order (200)', async () => {
    const res = await request(app)
      .post(`/api/v1/artisan/commandes/${CA_ID}/expedier`)
      .set('Authorization', 'Bearer token')
      .set('x-test-user-id', 'artisan-1')
      .set('x-test-role', 'ARTISAN');

    expect(res.status).toBe(200);
    expect(res.body.commandeArtisan.statut).toBe('EXPEDIEE');
    expect(res.body.statutGlobal).toBe('EXPEDIEE');
    expect(mockExpedier).toHaveBeenCalledWith('artisan-1', CA_ID);
  });

  it('propagates a NotFoundError when the order does not belong to the artisan (404)', async () => {
    mockGetMyCommandeArtisan.mockRejectedValue(new NotFoundError('Commande introuvable'));
    const res = await request(app)
      .get(`/api/v1/artisan/commandes/${CA_ID}`)
      .set('Authorization', 'Bearer token')
      .set('x-test-user-id', 'artisan-1')
      .set('x-test-role', 'ARTISAN');

    expect(res.status).toBe(404);
  });

  it('propagates a ConflictError for an invalid transition (409)', async () => {
    mockPreparer.mockRejectedValue(new ConflictError('Transition de statut invalide'));
    const res = await request(app)
      .post(`/api/v1/artisan/commandes/${CA_ID}/preparer`)
      .set('Authorization', 'Bearer token')
      .set('x-test-user-id', 'artisan-1')
      .set('x-test-role', 'ARTISAN');

    expect(res.status).toBe(409);
  });
});
