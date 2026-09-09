import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import {
  ForbiddenError,
  UnauthorizedError,
  NotFoundError,
} from '../../src/common/errors/AppError.js';

const mockList = vi.fn();
const mockGetOne = vi.fn();
const mockExportCsv = vi.fn();

vi.mock('../../src/modules/reviews/review.service.js', () => ({
  ReviewService: class {
    listAllAdmin = mockList;
    getReviewAdmin = mockGetOne;
    exportCsv = mockExportCsv;
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
}));

const app = (await import('../../src/app.js')).default;

const AVIS_ID = '123e4567-e89b-12d3-a456-426614174100';
const CMD_ID = '123e4567-e89b-12d3-a456-426614174101';

const authHeaders = (level: string, role = 'ADMIN') => ({
  Authorization: 'Bearer token',
  'x-test-role': role,
  'x-test-admin-level': level,
});

describe('Review admin routes (Integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    mockGetOne.mockResolvedValue({
      id: AVIS_ID,
      note: 5,
      commentaire: 'Magnifique pièce',
      dateAvis: new Date('2026-09-02T08:00:00.000Z'),
      estVerifie: true,
    });
    mockExportCsv.mockResolvedValue(
      '"id","note","commentaire","estVerifie","dateAvis","idCommande","dateCommande","auteurNom","auteurTelephone","statutCommande"\n'
    );
  });

  // ---- AUTH ----

  it('requires authentication to list reviews (401)', async () => {
    const res = await request(app).get('/api/v1/admin/avis');
    expect(res.status).toBe(401);
  });

  it('forbids a non-ADMIN role from listing reviews (403)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/avis')
      .set('Authorization', 'Bearer token')
      .set('x-test-user-id', 'acheteur-1')
      .set('x-test-role', 'ACHETEUR');

    expect(res.status).toBe(403);
    expect(mockList).not.toHaveBeenCalled();
  });

  // ---- NIVEAUX ----

  it('SUPPORT is allowed to list reviews (200)', async () => {
    mockList.mockResolvedValue({
      items: [{ id: AVIS_ID, note: 5, estVerifie: false }],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    const res = await request(app).get('/api/v1/admin/avis').set(authHeaders('SUPPORT'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.items).toEqual([{ id: AVIS_ID, note: 5, estVerifie: false }]);
    expect(res.body.totalPages).toBe(1);
  });

  it('MODERATEUR is allowed to list reviews (200)', async () => {
    const res = await request(app).get('/api/v1/admin/avis').set(authHeaders('MODERATEUR'));

    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalled();
  });

  it('SUPPORT is allowed to get a review detail (200)', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/avis/${AVIS_ID}`)
      .set(authHeaders('SUPPORT'));

    expect(res.status).toBe(200);
    expect(mockGetOne).toHaveBeenCalledWith(AVIS_ID);
  });

  it('SUPPORT is allowed to export reviews as CSV (200)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/avis/export')
      .set(authHeaders('SUPPORT'));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(mockExportCsv).toHaveBeenCalled();
  });

  it('MODERATEUR is allowed to export reviews as CSV (200)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/avis/export')
      .set(authHeaders('MODERATEUR'));

    expect(res.status).toBe(200);
    expect(mockExportCsv).toHaveBeenCalled();
  });

  // ---- ROUTES ----

  it('routes /export before /:id so the id param is not matched', async () => {
    const res = await request(app)
      .get('/api/v1/admin/avis/export')
      .set(authHeaders('SUPPORT'));

    expect(res.status).toBe(200);
    expect(mockExportCsv).toHaveBeenCalled();
    expect(mockGetOne).not.toHaveBeenCalled();
  });

  it('passes page and limit to the service (200)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/avis')
      .set(authHeaders('SUPPORT'))
      .query({ page: 2, limit: 10 });

    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith(2, 10, expect.anything());
  });

  it('passes the q search to the service (200)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/avis')
      .set(authHeaders('SUPPORT'))
      .query({ q: 'masque' });

    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith(1, 20, expect.objectContaining({ q: 'masque' }));
  });

  it('passes the note filter to the service (200)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/avis')
      .set(authHeaders('SUPPORT'))
      .query({ note: 5 });

    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith(1, 20, expect.objectContaining({ note: 5 }));
  });

  it('passes estVerifie=true and estVerifie=false to the service (200)', async () => {
    const resTrue = await request(app)
      .get('/api/v1/admin/avis')
      .set(authHeaders('SUPPORT'))
      .query({ estVerifie: 'true' });

    expect(resTrue.status).toBe(200);
    expect(mockList).toHaveBeenLastCalledWith(1, 20, expect.objectContaining({ estVerifie: true }));

    const resFalse = await request(app)
      .get('/api/v1/admin/avis')
      .set(authHeaders('SUPPORT'))
      .query({ estVerifie: 'false' });

    expect(resFalse.status).toBe(200);
    expect(mockList).toHaveBeenLastCalledWith(1, 20, expect.objectContaining({ estVerifie: false }));
  });

  it('passes the date range filters to the service (200)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/avis')
      .set(authHeaders('SUPPORT'))
      .query({ dateDebut: '2026-01-01T00:00:00.000Z', dateFin: '2026-01-31T00:00:00.000Z' });

    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith(
      1,
      20,
      expect.objectContaining({
        dateDebut: new Date('2026-01-01T00:00:00.000Z'),
        dateFin: new Date('2026-01-31T00:00:00.000Z'),
      })
    );
  });

  it('passes the commandeId filter to the service (200)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/avis')
      .set(authHeaders('SUPPORT'))
      .query({ commandeId: CMD_ID });

    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith(1, 20, expect.objectContaining({ commandeId: CMD_ID }));
  });

  it('returns totalPages = 0 when total = 0', async () => {
    const res = await request(app).get('/api/v1/admin/avis').set(authHeaders('SUPPORT'));

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.totalPages).toBe(0);
  });

  // ---- VALIDATION ----

  it('forbids a note outside 1-5 (400)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/avis')
      .set(authHeaders('SUPPORT'))
      .query({ note: 6 });

    expect(res.status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('forbids a malformed estVerifie value (400)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/avis')
      .set(authHeaders('SUPPORT'))
      .query({ estVerifie: 'oui' });

    expect(res.status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('forbids dateDebut after dateFin (400)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/avis')
      .set(authHeaders('SUPPORT'))
      .query({ dateDebut: '2026-02-01T00:00:00.000Z', dateFin: '2026-01-01T00:00:00.000Z' });

    expect(res.status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('forbids a non-uuid commandeId (400)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/avis')
      .set(authHeaders('SUPPORT'))
      .query({ commandeId: 'not-a-uuid' });

    expect(res.status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('forbids a non-uuid review id in the path (400)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/avis/not-a-uuid')
      .set(authHeaders('SUPPORT'));

    expect(res.status).toBe(400);
    expect(mockGetOne).not.toHaveBeenCalled();
  });

  // ---- ERREURS ----

  it('propagates a NotFoundError when the review does not exist (404)', async () => {
    mockGetOne.mockRejectedValue(new NotFoundError('Avis introuvable'));
    const res = await request(app)
      .get(`/api/v1/admin/avis/${AVIS_ID}`)
      .set(authHeaders('SUPPORT'));

    expect(res.status).toBe(404);
  });
});