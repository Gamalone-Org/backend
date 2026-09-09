import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import {
  ForbiddenError,
  UnauthorizedError,
  NotFoundError,
} from '../../src/common/errors/AppError.js';

const mockList = vi.fn();
const mockGetOne = vi.fn();
const mockUpdate = vi.fn();
const mockUpdateStatus = vi.fn();
const mockExportCsv = vi.fn();

vi.mock('../../src/modules/deliveries/delivery.service.js', () => ({
  DeliveryService: class {
    listAllAdmin = mockList;
    getDeliveryAdmin = mockGetOne;
    updateDelivery = mockUpdate;
    updateStatus = mockUpdateStatus;
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

const DEL_ID = '123e4567-e89b-12d3-a456-426614174200';

describe('Delivery admin routes (Integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    mockGetOne.mockResolvedValue({ id: DEL_ID, statut: 'EN_ATTENTE', transporteur: 'DHL' });
    mockUpdate.mockResolvedValue({
      id: DEL_ID,
      transporteur: 'Chronopost',
      numeroSuivi: null,
      statut: 'EN_ATTENTE',
    });
    mockUpdateStatus.mockResolvedValue({ id: DEL_ID, statut: 'EXPEDIEE' });
    mockExportCsv.mockResolvedValue(
      'idLivraison,idCommande,transporteur,numeroSuivi,destination,frais,statut,dateCommande\n'
    );
  });

  // ---- AUTH ----

  it('requires authentication to list deliveries (401)', async () => {
    const res = await request(app).get('/api/v1/admin/livraisons');
    expect(res.status).toBe(401);
  });

  it('forbids a non-ADMIN role from listing deliveries (403)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/livraisons')
      .set('Authorization', 'Bearer token')
      .set('x-test-user-id', 'acheteur-1')
      .set('x-test-role', 'ACHETEUR');

    expect(res.status).toBe(403);
    expect(mockList).not.toHaveBeenCalled();
  });

  // ---- NIVEAUX : SUPPORT ----

  it('SUPPORT is allowed to list deliveries (200)', async () => {
    mockList.mockResolvedValue({
      items: [{ id: DEL_ID, transporteur: 'DHL', statut: 'EN_ATTENTE' }],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    const res = await request(app)
      .get('/api/v1/admin/livraisons')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'SUPPORT');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.items).toEqual([{ id: DEL_ID, transporteur: 'DHL', statut: 'EN_ATTENTE' }]);
    expect(res.body.totalPages).toBe(1);
  });

  it('SUPPORT is allowed to get a delivery detail (200)', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/livraisons/${DEL_ID}`)
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'SUPPORT');

    expect(res.status).toBe(200);
    expect(mockGetOne).toHaveBeenCalledWith(DEL_ID);
  });

  it('SUPPORT is allowed to export deliveries as CSV (200)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/livraisons/export')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'SUPPORT');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(mockExportCsv).toHaveBeenCalled();
  });

  it('SUPPORT is forbidden from updating a delivery (403)', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/livraisons/${DEL_ID}`)
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'SUPPORT')
      .send({ transporteur: 'Chronopost' });

    expect(res.status).toBe(403);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('SUPPORT is forbidden from updating the delivery status (403)', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/livraisons/${DEL_ID}/statut`)
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'SUPPORT')
      .send({ statut: 'EXPEDIEE' });

    expect(res.status).toBe(403);
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });

  // ---- NIVEAUX : MODERATEUR ----

  it('MODERATEUR is allowed to list deliveries (200)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/livraisons')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'MODERATEUR');

    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalled();
  });

  it('MODERATEUR can update the transporteur only (200)', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/livraisons/${DEL_ID}`)
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'MODERATEUR')
      .send({ transporteur: 'Chronopost' });

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(DEL_ID, { transporteur: 'Chronopost' });
  });

  it('MODERATEUR can set the numeroSuivi only (200)', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/livraisons/${DEL_ID}`)
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'MODERATEUR')
      .send({ numeroSuivi: 'TG48-851-PORT' });

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(DEL_ID, { numeroSuivi: 'TG48-851-PORT' });
  });

  it('MODERATEUR can update both fields at once (200)', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/livraisons/${DEL_ID}`)
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'MODERATEUR')
      .send({ transporteur: 'DHL', numeroSuivi: 'TG48-851' });

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(DEL_ID, { transporteur: 'DHL', numeroSuivi: 'TG48-851' });
  });

  it('MODERATEUR can update the delivery status (200)', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/livraisons/${DEL_ID}/statut`)
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'MODERATEUR')
      .send({ statut: 'EXPEDIEE' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockUpdateStatus).toHaveBeenCalledWith(DEL_ID, 'EXPEDIEE');
  });

  // ---- ROUTES ----

  it('routes /export before /:id so the id param is not matched', async () => {
    const res = await request(app)
      .get('/api/v1/admin/livraisons/export')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'SUPPORT');

    expect(res.status).toBe(200);
    expect(mockExportCsv).toHaveBeenCalled();
    expect(mockGetOne).not.toHaveBeenCalled();
  });

  // ---- VALIDATION ----

  it('accepts a valid q search combined with statut (200)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/livraisons')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'SUPPORT')
      .query({ q: 'DHL', statut: 'EN_TRANSIT' });

    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith(1, 20, { q: 'DHL', statut: 'EN_TRANSIT' });
  });

  it('forbids a query statut outside DeliveryStatus (400)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/livraisons')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'SUPPORT')
      .query({ statut: 'DOUANE' });

    expect(res.status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('forbids an empty update body (400)', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/livraisons/${DEL_ID}`)
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'MODERATEUR')
      .send({});

    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('forbids an unknown field in the update body (400)', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/livraisons/${DEL_ID}`)
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'MODERATEUR')
      .send({ assurance: true });

    expect(res.status).toBe(400);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('forbids a statut not in DeliveryStatus in the update (400)', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/livraisons/${DEL_ID}/statut`)
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'MODERATEUR')
      .send({ statut: 'DOUANE' });

    expect(res.status).toBe(400);
    expect(mockUpdateStatus).not.toHaveBeenCalled();
  });

  // ---- PAGINATION ----

  it('passes page and limit to the service (200)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/livraisons')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'SUPPORT')
      .query({ page: 2, limit: 10 });

    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith(2, 10, {});
  });

  it('returns totalPages = 0 when total = 0', async () => {
    const res = await request(app)
      .get('/api/v1/admin/livraisons')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'SUPPORT');

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.totalPages).toBe(0);
  });

  // ---- ERREURS ----

  it('propagates a NotFoundError when the delivery does not exist (404)', async () => {
    mockGetOne.mockRejectedValue(new NotFoundError('Livraison introuvable'));
    const res = await request(app)
      .get(`/api/v1/admin/livraisons/${DEL_ID}`)
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'SUPPORT');

    expect(res.status).toBe(404);
  });
});