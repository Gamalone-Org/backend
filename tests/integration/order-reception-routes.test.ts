import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import {
  ForbiddenError,
  UnauthorizedError,
  ConflictError,
  NotFoundError,
} from '../../src/common/errors/AppError.js';

const mockConfirmerReception = vi.fn();
const mockGetMine = vi.fn();
const mockListMine = vi.fn();

vi.mock('../../src/modules/orders/order.service.js', () => ({
  OrderService: class {
    createCommande = vi.fn();
    getMyCommandes = mockListMine;
    getMyCommande = mockGetMine;
    confirmerReception = mockConfirmerReception;
    getAllAdmin = vi.fn();
    getCommandeAdmin = vi.fn();
    updateStatut = vi.fn();
    annuler = vi.fn();
    exportCsv = vi.fn();
    getMyCommandesArtisan = vi.fn();
    getMyCommandeArtisan = vi.fn();
    preparer = vi.fn();
    expedier = vi.fn();
    livrer = vi.fn();
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

const CMD_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('Buyer reception confirmation route (Integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConfirmerReception.mockResolvedValue({
      commande: { id: CMD_ID, statut: 'LIVREE' },
      dejaConfirmee: false,
    });
  });

  it('requires authentication (401)', async () => {
    const res = await request(app).post(`/api/v1/commandes/${CMD_ID}/confirmer-reception`);
    expect(res.status).toBe(401);
  });

  it('forbids a non-ACHETEUR role (403)', async () => {
    const res = await request(app)
      .post(`/api/v1/commandes/${CMD_ID}/confirmer-reception`)
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN');

    expect(res.status).toBe(403);
    expect(mockConfirmerReception).not.toHaveBeenCalled();
  });

  it('confirms the reception for the authenticated buyer (200)', async () => {
    const res = await request(app)
      .post(`/api/v1/commandes/${CMD_ID}/confirmer-reception`)
      .set('Authorization', 'Bearer token')
      .set('x-test-user-id', 'user-1');

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ success: true, dejaConfirmee: false });
    expect(mockConfirmerReception).toHaveBeenCalledWith('user-1', CMD_ID);
  });

  it('rejects an invalid order id (400)', async () => {
    const res = await request(app)
      .post('/api/v1/commandes/not-a-uuid/confirmer-reception')
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(400);
    expect(mockConfirmerReception).not.toHaveBeenCalled();
  });

  it('propagates a not found order (404)', async () => {
    mockConfirmerReception.mockRejectedValue(new NotFoundError('Commande introuvable'));

    const res = await request(app)
      .post(`/api/v1/commandes/${CMD_ID}/confirmer-reception`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(404);
  });

  it('propagates a conflict when conditions are not met (409)', async () => {
    mockConfirmerReception.mockRejectedValue(
      new ConflictError('La commande doit être livrée avant de confirmer la réception')
    );

    const res = await request(app)
      .post(`/api/v1/commandes/${CMD_ID}/confirmer-reception`)
      .set('Authorization', 'Bearer token');

    expect(res.status).toBe(409);
  });
});
