import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import {
  ForbiddenError,
  UnauthorizedError,
} from '../../src/common/errors/AppError.js';

const mockGetDashboard = vi.fn();

vi.mock('../../src/modules/admin/dashboard/dashboard.service.js', () => ({
  DashboardService: class {
    getDashboard = mockGetDashboard;
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
  requireAuth: (req: any, _res: any, next: any) => {    const authorization = req.headers.authorization;
    if (!authorization || !authorization.startsWith('Bearer ')) {
      next(new UnauthorizedError('Missing or invalid bearer token'));
      return;
    }

    req.user = {
      id: req.headers['x-test-user-id'] ?? 'admin-1',
      role: req.headers['x-test-role'] ?? 'ADMIN',
      telephone: '+22890123456',
      statut: 'ACTIF',
      adminAccessLevel: req.headers['x-test-admin-level'] ?? null,
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
  requireAdminLevel: (minimum: string) => (req: any, _res: any, next: any) => {
    if (!req.user || req.user.role !== 'ADMIN') {
      next(new ForbiddenError('Insufficient permissions'));
      return;
    }
    const level = req.user.adminAccessLevel;
    const rank: Record<string, number> = { SUPPORT: 0, MODERATEUR: 1, SUPER_ADMIN: 2 };
    if (!level || rank[level as string] === undefined || rank[level as string] < rank[minimum]) {
      next(new ForbiddenError('Insufficient permissions'));
      return;
    }
    next();
  },
  requirePermission: (...permissions: string[]) => (_req: any, _res: any, next: any) => next(),
}));

const app = (await import('../../src/app.js')).default;

const buildPayload = () => ({
  period: { key: '30d', from: 'from', to: 'to' },
  users: { total: 6, buyers: 3, artisans: 2, newUsers: 2, newBuyers: 1, newArtisans: 1 },
  kyc: { pending: 5, approved: 5, rejected: 1 },
  artworks: {
    total: 26,
    published: 10,
    pending: 4,
    reserved: 2,
    withdrawn: 1,
    sold: 6,
    newArtworks: 5,
  },
  orders: {
    total: 100,
    inPeriod: 10,
    byStatus: {
      COMMANDE: 40,
      PREPARATION: 0,
      EXPEDIEE: 0,
      LIVREE: 0,
      CLOTUREE: 0,
      ANNULEE: 0,
      REMBOURSEE: 0,
    },
  },
  revenue: { grossOrderVolume: 27500 },
  evolution: [{ date: '2026-08-09', orders: 1, volume: 1000 }],
  recentOrders: [],
});

describe('Admin dashboard routes (Integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDashboard.mockResolvedValue(buildPayload());
  });

  it('exige une authentification (401)', async () => {
    const res = await request(app).get('/api/v1/admin/dashboard');

    expect(res.status).toBe(401);
    expect(mockGetDashboard).not.toHaveBeenCalled();
  });

  it('refuse un BUYER (403)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', 'Bearer token')
      .set('x-test-user-id', 'acheteur-1')
      .set('x-test-role', 'ACHETEUR');

    expect(res.status).toBe(403);
    expect(mockGetDashboard).not.toHaveBeenCalled();
  });

  it('refuse un ARTISAN (403)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', 'Bearer token')
      .set('x-test-user-id', 'artisan-1')
      .set('x-test-role', 'ARTISAN');

    expect(res.status).toBe(403);
    expect(mockGetDashboard).not.toHaveBeenCalled();
  });

  it('refuse un rÃ´le ADMIN sans niveau dâ€™accÃ¨s (403)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN');

    expect(res.status).toBe(403);
    expect(mockGetDashboard).not.toHaveBeenCalled();
  });

  it('refuse un SUPPORT (403)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'SUPPORT');

    expect(res.status).toBe(403);
    expect(mockGetDashboard).not.toHaveBeenCalled();
  });

  it('refuse un MODERATEUR (403)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'MODERATEUR');

    expect(res.status).toBe(403);
    expect(mockGetDashboard).not.toHaveBeenCalled();
  });

  it('autorise un SUPER_ADMIN (200) avec la pÃ©riode par dÃ©faut 30d', async () => {
    const res = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'SUPER_ADMIN');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockGetDashboard).toHaveBeenCalledWith('30d');
    expect(res.body.period.key).toBe('30d');
  });

  it('passe la pÃ©riode demandÃ©e au service', async () => {
    await request(app)
      .get('/api/v1/admin/dashboard?period=7d')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'SUPER_ADMIN');

    expect(mockGetDashboard).toHaveBeenCalledWith('7d');
  });

  it('autorise toutes les pÃ©riodes valides (90d, 12m)', async () => {
    for (const period of ['90d', '12m']) {
      const res = await request(app)
        .get(`/api/v1/admin/dashboard?period=${period}`)
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'ADMIN')
        .set('x-test-admin-level', 'SUPER_ADMIN');

      expect(res.status).toBe(200);
      expect(mockGetDashboard).toHaveBeenCalledWith(period);
    }
  });

  it('rejette une pÃ©riode invalide (400)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/dashboard?period=annuel')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'SUPER_ADMIN');

    expect(res.status).toBe(400);
    expect(mockGetDashboard).not.toHaveBeenCalled();
  });

  it('renvoie succÃ¨s + payload du service sous une clÃ© success', async () => {
    const res = await request(app)
      .get('/api/v1/admin/dashboard')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'SUPER_ADMIN');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body).toMatchObject(buildPayload());
  });
});
