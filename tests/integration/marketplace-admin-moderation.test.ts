import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { ConflictError } from '../../src/common/errors/AppError.js';

const mockPublish = vi.fn();
const mockWithdrawAdmin = vi.fn();
const mockAllAdmin = vi.fn();
const mockGetAdmin = vi.fn();

vi.mock('../../src/modules/marketplace/oeuvre.service.js', () => ({
  OeuvreService: class {
    createOeuvre = vi.fn();
    getMyOeuvres = vi.fn();
    getMyOeuvre = vi.fn();
    updateOeuvre = vi.fn();
    deleteOeuvre = vi.fn();
    publishOeuvre = mockPublish;
    withdrawOeuvreAdmin = mockWithdrawAdmin;
    getAllAdmin = mockAllAdmin;
    getOeuvreAdmin = mockGetAdmin;
    getPublishedPublic = vi.fn();
    getFeatured = vi.fn();
    getOeuvrePublic = vi.fn();
    getOeuvresByArtisanPublic = vi.fn();
  },
}));

vi.mock('../../src/modules/marketplace/media.service.js', () => ({
  MediaService: class {
    uploadMedia = vi.fn();
    deleteMedia = vi.fn();
    reorderMedias = vi.fn();
    setPhotoAtelier = vi.fn();
    deletePhotoAtelier = vi.fn();
  },
}));

vi.mock('../../src/modules/auth/middleware/auth.middleware.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: '11111111-1111-1111-1111-111111111111', role: 'ADMIN' };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  requireAdminLevel: () => (_req: any, _res: any, next: any) => next(),
  requirePermission: (...permissions: string[]) => (_req: any, _res: any, next: any) => next(),
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

const app = (await import('../../src/app.js')).default;

const OEUVRE_ID = '123e4567-e89b-12d3-a456-426614174400';

describe('Marketplace admin moderation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAllAdmin.mockResolvedValue({ oeuvres: [], total: 0 });
    mockGetAdmin.mockResolvedValue({ id: OEUVRE_ID, statut: 'EN_ATTENTE_VALIDATION' });
    mockPublish.mockResolvedValue({ id: OEUVRE_ID, statut: 'PUBLIEE' });
    mockWithdrawAdmin.mockResolvedValue({ id: OEUVRE_ID, statut: 'RETIREE' });
  });

  it('GET /api/v1/admin/oeuvres lists all oeuvres with filters', async () => {
    const response = await request(app).get('/api/v1/admin/oeuvres?statut=PUBLIEE');
    expect(response.status).toBe(200);
    expect(mockAllAdmin).toHaveBeenCalledWith(
      1,
      20,
      expect.objectContaining({ statut: 'PUBLIEE' }),
      expect.anything()
    );
  });

  it('GET /api/v1/admin/oeuvres/:id returns details', async () => {
    const response = await request(app).get(`/api/v1/admin/oeuvres/${OEUVRE_ID}`);
    expect(response.status).toBe(200);
    expect(mockGetAdmin).toHaveBeenCalledWith(OEUVRE_ID);
  });

  it('POST /api/v1/admin/oeuvres/:id/publish publishes the oeuvre', async () => {
    const response = await request(app).post(`/api/v1/admin/oeuvres/${OEUVRE_ID}/publish`);
    expect(response.status).toBe(200);
    expect(mockPublish).toHaveBeenCalled();
  });

  it('POST /api/v1/admin/oeuvres/:id/publish returns 409 when ConflictError', async () => {
    mockPublish.mockRejectedValueOnce(
      new ConflictError('Seules les Å“uvres non publiÃ©es peuvent Ãªtre publiÃ©es')
    );
    const response = await request(app).post(`/api/v1/admin/oeuvres/${OEUVRE_ID}/publish`);
    expect(response.status).toBe(409);
  });

  it('POST /api/v1/admin/oeuvres/:id/withdraw retires published oeuvre', async () => {
    const response = await request(app).post(`/api/v1/admin/oeuvres/${OEUVRE_ID}/withdraw`);
    expect(response.status).toBe(200);
    expect(mockWithdrawAdmin).toHaveBeenCalledWith(OEUVRE_ID);
  });

  it('POST /api/v1/admin/oeuvres/:id/reject returns 404 (route removed)', async () => {
    const response = await request(app)
      .post(`/api/v1/admin/oeuvres/${OEUVRE_ID}/reject`)
      .send({ reason: 'Test' });
    expect(response.status).toBe(404);
  });
});
