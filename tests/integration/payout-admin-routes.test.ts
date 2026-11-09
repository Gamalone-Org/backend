import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../../src/common/errors/AppError.js';

const mocks = vi.hoisted(() => ({
  listForAdmin: vi.fn(),
  listAEfectuer: vi.fn(),
  getForAdmin: vi.fn(),
  declencherPayout: vi.fn(),
  relancerPayout: vi.fn(),
  synchroniserPayout: vi.fn(),
}));

vi.mock('../../src/modules/payouts/payout.service.js', () => ({
  PayoutService: class {
    listForAdmin = mocks.listForAdmin;
    listAEfectuer = mocks.listAEfectuer;
    getForAdmin = mocks.getForAdmin;
    declencherPayout = mocks.declencherPayout;
    relancerPayout = mocks.relancerPayout;
    synchroniserPayout = mocks.synchroniserPayout;
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

const COMMANDE_ARTISAN_ID = '11111111-1111-4111-8111-111111111111';
const PAYOUT_ID = '22222222-2222-4222-8222-222222222222';

describe('Payout admin routes (Integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.listForAdmin.mockResolvedValue({ reversements: [], total: 0, page: 1, limit: 20, totalPages: 1 });
    mocks.listAEfectuer.mockResolvedValue({
      commandesArtisans: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 1,
    });
    mocks.getForAdmin.mockResolvedValue({ id: PAYOUT_ID, statut: 'VERSE' });
    mocks.declencherPayout.mockResolvedValue({
      payoutId: PAYOUT_ID,
      statut: 'EN_TRAITEMENT',
      referenceExterne: '55',
      montantNet: 9_000,
    });
    mocks.relancerPayout.mockResolvedValue({
      payoutId: PAYOUT_ID,
      statut: 'EN_TRAITEMENT',
      referenceExterne: '90',
      montantNet: 9_000,
    });
    mocks.synchroniserPayout.mockResolvedValue({ id: PAYOUT_ID, statut: 'VERSE', statutExterne: 'sent' });
  });

  it('requires authentication', async () => {
    const response = await request(app).get('/api/v1/admin/reversements');
    expect(response.status).toBe(401);
  });

  it('allows SUPPORT to list payouts', async () => {
    const response = await request(app)
      .get('/api/v1/admin/reversements')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({ success: true, total: 0 });
    expect(mocks.listForAdmin).toHaveBeenCalled();
  });

  it('rejects an invalid status filter', async () => {
    const response = await request(app)
      .get('/api/v1/admin/reversements')
      .query({ statut: 'NOPE' })
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(400);
    expect(mocks.listForAdmin).not.toHaveBeenCalled();
  });

  it('lists eligible sub-orders via /a-effectuer before the :id route', async () => {
    const response = await request(app)
      .get('/api/v1/admin/reversements/a-effectuer')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(200);
    expect(mocks.listAEfectuer).toHaveBeenCalled();
    expect(mocks.getForAdmin).not.toHaveBeenCalled();
  });

  it('returns an invalid id as 400', async () => {
    const response = await request(app)
      .get('/api/v1/admin/reversements/not-a-uuid')
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(400);
    expect(mocks.getForAdmin).not.toHaveBeenCalled();
  });

  it('propagates a not found detail as 404', async () => {
    mocks.getForAdmin.mockRejectedValue(new NotFoundError('Reversement introuvable'));
    const response = await request(app)
      .get(`/api/v1/admin/reversements/${PAYOUT_ID}`)
      .set('Authorization', 'Bearer token');

    expect(response.status).toBe(404);
  });

  it('forbids SUPPORT from triggering a payout (SUPER_ADMIN only)', async () => {
    const response = await request(app)
      .post(`/api/v1/admin/reversements/artisans/${COMMANDE_ARTISAN_ID}/declencher`)
      .set('Authorization', 'Bearer token')
      .set('x-test-admin-level', 'SUPPORT');

    expect(response.status).toBe(403);
    expect(mocks.declencherPayout).not.toHaveBeenCalled();
  });

  it('disables automatic FedaPay trigger with 410 Gone', async () => {
    const response = await request(app)
      .post(`/api/v1/admin/reversements/artisans/${COMMANDE_ARTISAN_ID}/declencher`)
      .set('Authorization', 'Bearer token')
      .set('x-test-admin-level', 'SUPER_ADMIN');

    expect(response.status).toBe(410);
    expect(response.body.code).toBe('PAYOUTS_AUTOMATIC_DISABLED');
    expect(mocks.declencherPayout).not.toHaveBeenCalled();
  });

  it('disables automatic FedaPay relaunch with 410 Gone', async () => {
    const relaunch = await request(app)
      .post(`/api/v1/admin/reversements/${PAYOUT_ID}/relancer`)
      .set('Authorization', 'Bearer token')
      .set('x-test-admin-level', 'SUPER_ADMIN');
    expect(relaunch.status).toBe(410);
    expect(mocks.relancerPayout).not.toHaveBeenCalled();
  });

  it('keeps synchronise available for historical FedaPay payouts', async () => {
    const sync = await request(app)
      .post(`/api/v1/admin/reversements/${PAYOUT_ID}/synchroniser`)
      .set('Authorization', 'Bearer token')
      .set('x-test-admin-level', 'SUPER_ADMIN');
    expect(sync.status).toBe(200);
    expect(mocks.synchroniserPayout).toHaveBeenCalledWith(PAYOUT_ID);
  });
});
