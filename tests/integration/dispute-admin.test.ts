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

vi.mock('../../src/modules/disputes/dispute.service.js', () => ({
  DisputeService: class {
    listAllAdmin = mockList;
    getDisputeAdmin = mockGetOne;
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

const LITIGE_ID = '123e4567-e89b-12d3-a456-426614174200';
const CMD_ID = '123e4567-e89b-12d3-a456-426614174201';

const authHeaders = (level: string, role = 'ADMIN') => ({
  Authorization: 'Bearer token',
  'x-test-role': role,
  'x-test-admin-level': level,
});

describe('Dispute admin routes (Integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    mockGetOne.mockResolvedValue({ id: LITIGE_ID, motif: 'Œuvre non conforme', statut: 'OUVERT' });
    mockExportCsv.mockResolvedValue(
      'id,motif,statut,createdAt,updatedAt,idCommande,dateCommande,statutCommande,montantCommande,clientNom,clientTelephone,artisanNomAtelier,artisanNom,artisanTelephone\n'
    );
  });

  // ---- AUTH ----

  it('requires authentication to list disputes (401)', async () => {
    const res = await request(app).get('/api/v1/admin/litiges');
    expect(res.status).toBe(401);
  });

  it('forbids a non-ADMIN role from listing disputes (403)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/litiges')
      .set('Authorization', 'Bearer token')
      .set('x-test-user-id', 'acheteur-1')
      .set('x-test-role', 'ACHETEUR');

    expect(res.status).toBe(403);
    expect(mockList).not.toHaveBeenCalled();
  });

  // ---- NIVEAUX : SUPPORT ----

  it('SUPPORT is allowed to list disputes (200)', async () => {
    mockList.mockResolvedValue({
      items: [{ id: LITIGE_ID, motif: 'Œuvre non conforme', statut: 'OUVERT' }],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    const res = await request(app)
      .get('/api/v1/admin/litiges')
      .set(authHeaders('SUPPORT'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.items).toEqual([{ id: LITIGE_ID, motif: 'Œuvre non conforme', statut: 'OUVERT' }]);
    expect(res.body.totalPages).toBe(1);
  });

  it('SUPPORT is allowed to get a dispute detail (200)', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/litiges/${LITIGE_ID}`)
      .set(authHeaders('SUPPORT'));

    expect(res.status).toBe(200);
    expect(mockGetOne).toHaveBeenCalledWith(LITIGE_ID);
  });

  it('SUPPORT is allowed to export disputes as CSV (200)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/litiges/export')
      .set(authHeaders('SUPPORT'));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(mockExportCsv).toHaveBeenCalled();
  });

  // ---- ROUTES ----

  it('routes /export before /:id so the id param is not matched', async () => {
    const res = await request(app)
      .get('/api/v1/admin/litiges/export')
      .set(authHeaders('SUPPORT'));

    expect(res.status).toBe(200);
    expect(mockExportCsv).toHaveBeenCalled();
    expect(mockGetOne).not.toHaveBeenCalled();
  });

  // ---- VALIDATION ----

  it('accepts a valid q search combined with statut (200)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/litiges')
      .set(authHeaders('SUPPORT'))
      .query({ q: 'conforme', statut: 'OUVERT' });

    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith(1, 20, { q: 'conforme', statut: 'OUVERT' });
  });

  it('accepts clientId and artisanId filters (200)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/litiges')
      .set(authHeaders('SUPPORT'))
      .query({ clientId: '123e4567-e89b-12d3-a456-426614174202', artisanId: '123e4567-e89b-12d3-a456-426614174203' });

    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith(1, 20, {
      clientId: '123e4567-e89b-12d3-a456-426614174202',
      artisanId: '123e4567-e89b-12d3-a456-426614174203',
    });
  });

  it('forbids a statut outside DisputeStatus (400)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/litiges')
      .set(authHeaders('SUPPORT'))
      .query({ statut: 'REFUSE' });

    expect(res.status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('forbids dateDebut after dateFin (400)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/litiges')
      .set(authHeaders('SUPPORT'))
      .query({ dateDebut: '2026-02-01T00:00:00.000Z', dateFin: '2026-01-01T00:00:00.000Z' });

    expect(res.status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('forbids an invalid dispute id in the detail path (400)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/litiges/not-a-uuid')
      .set(authHeaders('SUPPORT'));

    expect(res.status).toBe(400);
    expect(mockGetOne).not.toHaveBeenCalled();
  });

  // ---- PAGINATION ----

  it('passes page and limit to the service (200)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/litiges')
      .set(authHeaders('SUPPORT'))
      .query({ page: 2, limit: 10 });

    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith(2, 10, {});
  });

  it('returns totalPages = 0 when total = 0', async () => {
    const res = await request(app)
      .get('/api/v1/admin/litiges')
      .set(authHeaders('SUPPORT'));

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.totalPages).toBe(0);
  });

  // ---- ERREURS ----

  it('propagates a NotFoundError when the dispute does not exist (404)', async () => {
    mockGetOne.mockRejectedValue(new NotFoundError('Litige introuvable'));
    const res = await request(app)
      .get(`/api/v1/admin/litiges/${LITIGE_ID}`)
      .set(authHeaders('SUPPORT'));

    expect(res.status).toBe(404);
  });
});