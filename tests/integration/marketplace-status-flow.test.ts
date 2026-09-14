import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { ConflictError } from '../../src/common/errors/AppError.js';

const makeOeuvre = (overrides = {}) => ({
  id: '123e4567-e89b-12d3-a456-426614174100',
  titre: 'Sculpture sur bois',
  description: 'Une sculpture',
  technique: 'Main',
  materiaux: 'Bois',
  dimensions: '30x40',
  anneeCreation: 2023,
  prixXOF: 50000,
  statut: 'BROUILLON',
  categorieId: '123e4567-e89b-12d3-a456-426614174001',
  artisanId: '123e4567-e89b-12d3-a456-426614174111',
  ...overrides,
});

const mockCreate = vi.fn();
const mockListMy = vi.fn();
const mockGetMy = vi.fn();
const mockPublish = vi.fn();
const mockWithdrawAdmin = vi.fn();
const mockAllAdmin = vi.fn();

vi.mock('../../src/modules/marketplace/oeuvre.service.js', () => ({
  OeuvreService: class {
    createOeuvre = mockCreate;
    getMyOeuvres = mockListMy;
    getMyOeuvre = mockGetMy;
    updateOeuvre = vi.fn();
    deleteOeuvre = vi.fn();
    publishOeuvre = mockPublish;
    withdrawOeuvreAdmin = mockWithdrawAdmin;
    getAllAdmin = mockAllAdmin;
    getOeuvreAdmin = vi.fn();
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

const OEUVRE_ID = '123e4567-e89b-12d3-a456-426614174100';
const ARTISAN_ID = '123e4567-e89b-12d3-a456-426614174111';

describe('Marketplace status flow & moderation routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue(makeOeuvre());
    mockListMy.mockResolvedValue({ oeuvres: [], total: 0 });
    mockGetMy.mockResolvedValue(makeOeuvre());
    mockAllAdmin.mockResolvedValue({ oeuvres: [], total: 0 });
  });

  it('POST /api/v1/admin/oeuvres creates a BROUILLON', async () => {
    const response = await request(app).post('/api/v1/admin/oeuvres').send({
      artisanId: ARTISAN_ID,
      titre: 'Sculpture sur bois',
      description: 'Une sculpture',
      technique: 'Main',
      materiaux: 'Bois',
      dimensions: '30x40',
      anneeCreation: 2023,
      prixXOF: 50000,
      categorieId: '123e4567-e89b-12d3-a456-426614174001',
    });

    expect(response.status).toBe(201);
    expect(response.body.oeuvre.statut).toBe('BROUILLON');
  });

  it('POST publish transitions BROUILLON -> PUBLIEE', async () => {
    mockPublish.mockResolvedValue(makeOeuvre({ statut: 'PUBLIEE' }));
    const response = await request(app).post(`/api/v1/admin/oeuvres/${OEUVRE_ID}/publish`);
    expect(response.status).toBe(200);
    expect(response.body.oeuvre.statut).toBe('PUBLIEE');
  });

  it('POST publish when already published with no media returns 409', async () => {
    mockPublish.mockRejectedValueOnce(
      new ConflictError('Au moins une image est requise pour publier une Å“uvre')
    );
    const response = await request(app).post(`/api/v1/admin/oeuvres/${OEUVRE_ID}/publish`);
    expect(response.status).toBe(409);
  });

  it('POST publish concurrent/duplicate returns 409', async () => {
    mockPublish.mockRejectedValueOnce(
      new ConflictError('Seules les Å“uvres non publiÃ©es peuvent Ãªtre publiÃ©es')
    );
    const response = await request(app).post(`/api/v1/admin/oeuvres/${OEUVRE_ID}/publish`);
    expect(response.status).toBe(409);
  });

  it('POST withdraw transitions PUBLIEE -> RETIREE', async () => {
    mockWithdrawAdmin.mockResolvedValue(makeOeuvre({ statut: 'RETIREE' }));
    const response = await request(app).post(`/api/v1/admin/oeuvres/${OEUVRE_ID}/withdraw`);
    expect(response.status).toBe(200);
    expect(response.body.oeuvre.statut).toBe('RETIREE');
  });

  it('GET /api/v1/admin/oeuvres lists all oeuvres', async () => {
    const response = await request(app).get('/api/v1/admin/oeuvres');
    expect(response.status).toBe(200);
    expect(mockAllAdmin).toHaveBeenCalled();
  });

  it('GET /api/v1/artisan/oeuvres lists my oeuvres', async () => {
    const response = await request(app).get('/api/v1/artisan/oeuvres');
    expect(response.status).toBe(200);
    expect(mockListMy).toHaveBeenCalled();
  });

  it('GET /api/v1/artisan/oeuvres/:id returns my oeuvre', async () => {
    const response = await request(app).get(`/api/v1/artisan/oeuvres/${OEUVRE_ID}`);
    expect(response.status).toBe(200);
    expect(mockGetMy).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      OEUVRE_ID
    );
  });

  it('POST /api/v1/artisan/oeuvres returns 404 (route removed)', async () => {
    const response = await request(app).post('/api/v1/artisan/oeuvres').send({
      artisanId: ARTISAN_ID,
      titre: 'Sculpture',
    });
    expect(response.status).toBe(404);
  });
});
