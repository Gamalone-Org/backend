import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import {
  ForbiddenError,
  UnauthorizedError,
  NotFoundError,
} from '../../src/common/errors/AppError.js';

const mockListForAdmin = vi.fn();
const mockGetForAdmin = vi.fn();

vi.mock('../../src/modules/payments/payment.service.js', () => ({
  PaymentService: class {
    listForAdmin = mockListForAdmin;
    getForAdmin = mockGetForAdmin;
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
      submit: vi.fn(), resubmit: vi.fn(), getMine: vi.fn(), getById: vi.fn(),
      uploadDocument: vi.fn(), getDocuments: vi.fn(), deleteDocument: vi.fn(),
      listPendingReviews: vi.fn(), runPurge: vi.fn(), getReviewHistory: vi.fn(),
      getAdminDetailsById: vi.fn(), approve: vi.fn(), reject: vi.fn(),
      requestCorrection: vi.fn(), setLegalHold: vi.fn(), anonymize: vi.fn(),
    },
  }),
}));

const ADMIN_LEVEL_RANK: Record<string, number> = {
  SUPPORT: 0,
  MODERATEUR: 1,
  SUPER_ADMIN: 2,
};

vi.mock('../../src/modules/auth/middleware/auth.middleware.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    const authorization = req.headers.authorization;
    if (!authorization || !authorization.startsWith('Bearer ')) {
      next(new UnauthorizedError('Missing or invalid bearer token'));
      return;
    }

    req.user = {
      id: req.headers['x-test-user-id'] ?? 'admin-1',
      role: req.headers['x-test-role'] ?? 'ADMIN',
      telephone: '+22890123456',
      statut: 'ACTIF',
      adminAccessLevel: req.headers['x-test-admin-level'] ?? 'SUPPORT',
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
  requireAdminLevel: (minimumLevel: string) => (req: any, _res: any, next: any) => {
    const current = req.user?.adminAccessLevel ?? req.headers['x-test-admin-level'];
    if (!current || (ADMIN_LEVEL_RANK[current] ?? -1) < (ADMIN_LEVEL_RANK[minimumLevel] ?? 99)) {
      next(new ForbiddenError('Insufficient admin access level'));
      return;
    }
    next();
  },
  requirePermission: (...permissions: string[]) => (_req: any, _res: any, next: any) => next(),
}));

const app = (await import('../../src/app.js')).default;

const PAIEMENT_ID = '123e4567-e89b-12d3-a456-426614174300';

describe('Payment admin routes (Integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListForAdmin.mockResolvedValue({
      paiements: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
    mockGetForAdmin.mockResolvedValue({ id: PAIEMENT_ID, statut: 'REUSSI', tentatives: [] });
  });

  it('requires authentication to list payments (401)', async () => {
    const res = await request(app).get('/api/v1/admin/paiements');
    expect(res.status).toBe(401);
  });

  it('forbids a non-ADMIN role (403)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/paiements')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ACHETEUR');

    expect(res.status).toBe(403);
    expect(mockListForAdmin).not.toHaveBeenCalled();
  });

  it('allows SUPPORT to list payments (200)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/paiements')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, total: 0, page: 1, limit: 20 });
    expect(mockListForAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ page: 1, limit: 20 })
    );
  });

  it('parses reconciliationRequise as a boolean and forwards filters', async () => {
    const res = await request(app)
      .get('/api/v1/admin/paiements')
      .query({ statut: 'REUSSI', reconciliationRequise: 'true', q: 'REF-1', page: 2, limit: 10 })
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(mockListForAdmin).toHaveBeenCalledWith(
      expect.objectContaining({
        statut: 'REUSSI',
        reconciliationRequise: true,
        q: 'REF-1',
        page: 2,
        limit: 10,
      })
    );
  });

  it('rejects an invalid status filter (400) without calling the service', async () => {
    const res = await request(app)
      .get('/api/v1/admin/paiements')
      .query({ statut: 'NOT_A_STATUS' })
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(400);
    expect(mockListForAdmin).not.toHaveBeenCalled();
  });

  it('returns a payment detail (200)', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/paiements/${PAIEMENT_ID}`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(200);
    expect(res.body.paiement).toMatchObject({ id: PAIEMENT_ID, statut: 'REUSSI' });
    expect(mockGetForAdmin).toHaveBeenCalledWith(PAIEMENT_ID);
  });

  it('rejects an invalid id (400)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/paiements/not-a-uuid')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(400);
    expect(mockGetForAdmin).not.toHaveBeenCalled();
  });

  it('propagates a not found payment (404)', async () => {
    mockGetForAdmin.mockRejectedValue(new NotFoundError('Paiement introuvable'));

    const res = await request(app)
      .get(`/api/v1/admin/paiements/${PAIEMENT_ID}`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(404);
  });
});
