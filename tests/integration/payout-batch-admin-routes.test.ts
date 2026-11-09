import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { ConflictError, ForbiddenError, UnauthorizedError } from '../../src/common/errors/AppError.js';

const mocks = vi.hoisted(() => ({
  listForAdmin: vi.fn(),
  listEligibleGrouped: vi.fn(),
  getForAdmin: vi.fn(),
  prepareBatch: vi.fn(),
  confirmBatch: vi.fn(),
  cancelBatch: vi.fn(),
}));

vi.mock('../../src/modules/payouts/payout-batch.service.js', () => ({
  PayoutBatchService: class {
    listForAdmin = mocks.listForAdmin;
    listEligibleGrouped = mocks.listEligibleGrouped;
    getForAdmin = mocks.getForAdmin;
    prepareBatch = mocks.prepareBatch;
    confirmBatch = mocks.confirmBatch;
    cancelBatch = mocks.cancelBatch;
  },
}));

vi.mock('../../src/shared/cloudinary/index.js', () => ({
  cloudinary: { uploader: { destroy: vi.fn() } },
  CloudinaryService: class {
    uploadDocument = vi.fn();
    getDocuments = vi.fn();
    deleteDocument = vi.fn();
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
    if (!req.headers.authorization) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }
    req.user = {
      id: 'admin-1',
      role: 'ADMIN',
      adminAccessLevel: req.headers['x-test-admin-level'] ?? 'SUPER_ADMIN',
    };
    next();
  },
  requireRole: (...roles: string[]) => (req: any, _res: any, next: any) => {
    if (!roles.includes(req.user?.role)) {
      next(new ForbiddenError('Forbidden'));
      return;
    }
    next();
  },
  requireAdminLevel: (minimumLevel: string) => (req: any, _res: any, next: any) => {
    const current = req.user?.adminAccessLevel ?? 'SUPPORT';
    if ((ADMIN_LEVEL_RANK[current] ?? -1) < (ADMIN_LEVEL_RANK[minimumLevel] ?? 99)) {
      next(new ForbiddenError('Insufficient admin access level'));
      return;
    }
    next();
  },
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));

const app = (await import('../../src/app.js')).default;

describe('PayoutBatch admin routes (Integration)', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('lists batches for SUPPORT', async () => {
    mocks.listForAdmin.mockResolvedValue({ batches: [], total: 0, page: 1, limit: 20, totalPages: 1 });
    const res = await request(app)
      .get('/api/v1/admin/reversements-groupes')
      .set('Authorization', 'Bearer token')
      .set('x-test-admin-level', 'SUPPORT');
    expect(res.status).toBe(200);
  });

  it('lists eligible orders grouped by artisan before the :id route', async () => {
    mocks.listEligibleGrouped.mockResolvedValue({
      artisans: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
    const res = await request(app)
      .get('/api/v1/admin/reversements-groupes/eligibles')
      .set('Authorization', 'Bearer token')
      .set('x-test-admin-level', 'SUPPORT');
    expect(res.status).toBe(200);
    expect(mocks.listEligibleGrouped).toHaveBeenCalled();
    expect(mocks.getForAdmin).not.toHaveBeenCalled();
  });

  it('lets SUPER_ADMIN prepare a batch', async () => {
    mocks.prepareBatch.mockResolvedValue({ id: 'batch1' });
    const res = await request(app)
      .post('/api/v1/admin/reversements-groupes/preparer')
      .set('Authorization', 'Bearer token')
      .set('x-test-admin-level', 'SUPER_ADMIN')
      .send({ artisanId: '11111111-1111-4111-8111-111111111111', commandeArtisanIds: ['22222222-2222-4222-8222-222222222222'] });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe('batch1');
  });

  it('refuses preparation for SUPPORT', async () => {
    const res = await request(app)
      .post('/api/v1/admin/reversements-groupes/preparer')
      .set('Authorization', 'Bearer token')
      .set('x-test-admin-level', 'SUPPORT')
      .send({ artisanId: '11111111-1111-4111-8111-111111111111', commandeArtisanIds: ['22222222-2222-4222-8222-222222222222'] });
    expect(res.status).toBe(403);
  });

  it('confirms a batch as SUPER_ADMIN', async () => {
    mocks.confirmBatch.mockResolvedValue({ id: 'batch1', statut: 'VERSE' });
    const res = await request(app)
      .post('/api/v1/admin/reversements-groupes/11111111-1111-4111-8111-111111111111/confirmer')
      .set('Authorization', 'Bearer token')
      .set('x-test-admin-level', 'SUPER_ADMIN')
      .send({ moyenPaiement: 'MOBILE_MONEY', referenceTransfert: 'REF-123' });
    expect(res.status).toBe(200);
    expect(res.body.statut).toBe('VERSE');
  });

  it('rejects card payment method', async () => {
    const res = await request(app)
      .post('/api/v1/admin/reversements-groupes/11111111-1111-4111-8111-111111111111/confirmer')
      .set('Authorization', 'Bearer token')
      .set('x-test-admin-level', 'SUPER_ADMIN')
      .send({ moyenPaiement: 'CARTE_BANCAIRE', referenceTransfert: 'REF-123' });
    expect(res.status).toBe(400);
  });

  it('cancels a batch as SUPER_ADMIN', async () => {
    mocks.cancelBatch.mockResolvedValue({ id: 'batch1' });
    const res = await request(app)
      .post('/api/v1/admin/reversements-groupes/11111111-1111-4111-8111-111111111111/annuler')
      .set('Authorization', 'Bearer token')
      .set('x-test-admin-level', 'SUPER_ADMIN')
      .send({ motifAnnulation: 'Erreur de sélection' });
    expect(res.status).toBe(200);
  });

  it('refuses cancel without motif', async () => {
    const res = await request(app)
      .post('/api/v1/admin/reversements-groupes/11111111-1111-4111-8111-111111111111/annuler')
      .set('Authorization', 'Bearer token')
      .set('x-test-admin-level', 'SUPER_ADMIN')
      .send({});
    expect(res.status).toBe(400);
  });
});
