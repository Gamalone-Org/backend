import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { NotFoundError } from '../../src/common/errors/AppError.js';

const makeOeuvre = (overrides = {}) => ({
  id: '123e4567-e89b-12d3-a456-426614174000',
  titre: 'Sculpture sur bois',
  description: 'Une sculpture',
  technique: 'Main',
  materiaux: 'Bois',
  dimensions: '30x40',
  poids: 2.5,
  anneeCreation: 2023,
  prixXOF: 50000,
  statut: 'BROUILLON',
  categorieId: '123e4567-e89b-12d3-a456-426614174001',
  ...overrides,
});

const mockCreate = vi.fn();
const mockListMy = vi.fn();
const mockGetMy = vi.fn();
const mockUpdate = vi.fn();
const mockDelete = vi.fn();
const mockPublish = vi.fn();
const mockWithdrawAdmin = vi.fn();
const mockAllAdmin = vi.fn();
const mockGetAdmin = vi.fn();

vi.mock('../../src/modules/marketplace/oeuvre.service.js', () => ({
  OeuvreService: class {
    createOeuvre = mockCreate;
    getMyOeuvres = mockListMy;
    getMyOeuvre = mockGetMy;
    updateOeuvre = mockUpdate;
    deleteOeuvre = mockDelete;
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

const ARTISAN_ID = '123e4567-e89b-12d3-a456-426614174111';
const OEUVRE_ID = '123e4567-e89b-12d3-a456-426614174000';

describe('Marketplace admin oeuvre CRUD routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue(makeOeuvre());
    mockListMy.mockResolvedValue({ oeuvres: [], total: 0 });
    mockGetMy.mockResolvedValue(makeOeuvre());
    mockUpdate.mockResolvedValue(makeOeuvre({ titre: 'Nouveau' }));
    mockPublish.mockResolvedValue(makeOeuvre({ statut: 'PUBLIEE' }));
    mockWithdrawAdmin.mockResolvedValue(makeOeuvre({ statut: 'RETIREE' }));
    mockAllAdmin.mockResolvedValue({ oeuvres: [], total: 0 });
    mockGetAdmin.mockResolvedValue(makeOeuvre());
  });

  it('POST /api/v1/admin/oeuvres with artisanId returns 201', async () => {
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
    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('oeuvre');
  });

  it('POST /api/v1/admin/oeuvres returns 400 when artisanId is missing', async () => {
    const response = await request(app).post('/api/v1/admin/oeuvres').send({
      titre: 'Sculpture sur bois',
      description: 'Une sculpture',
      technique: 'Main',
      materiaux: 'Bois',
      dimensions: '30x40',
      anneeCreation: 2023,
      prixXOF: 50000,
      categorieId: '123e4567-e89b-12d3-a456-426614174001',
    });

    expect(response.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('POST /api/v1/admin/oeuvres returns 400 when artisanId is not a uuid', async () => {
    const response = await request(app).post('/api/v1/admin/oeuvres').send({
      artisanId: 'not-a-uuid',
      titre: 'Sculpture sur bois',
      description: 'Une sculpture',
      technique: 'Main',
      materiaux: 'Bois',
      dimensions: '30x40',
      anneeCreation: 2023,
      prixXOF: 50000,
      categorieId: '123e4567-e89b-12d3-a456-426614174001',
    });

    expect(response.status).toBe(400);
  });

  it('GET /api/v1/admin/oeuvres lists all oeuvres', async () => {
    const response = await request(app).get('/api/v1/admin/oeuvres');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
  });

  it('GET /api/v1/admin/oeuvres/:id returns oeuvre', async () => {
    const response = await request(app).get(`/api/v1/admin/oeuvres/${OEUVRE_ID}`);

    expect(response.status).toBe(200);
    expect(mockGetAdmin).toHaveBeenCalledWith(OEUVRE_ID);
  });

  it('GET /api/v1/admin/oeuvres/:id returns 404 for missing oeuvre', async () => {
    mockGetAdmin.mockRejectedValueOnce(new NotFoundError('Å’uvre non trouvÃ©e'));
    const response = await request(app).get(`/api/v1/admin/oeuvres/${OEUVRE_ID}`);

    expect(response.status).toBe(404);
  });

  it('PATCH /api/v1/admin/oeuvres/:id updates an oeuvre', async () => {
    const response = await request(app)
      .patch(`/api/v1/admin/oeuvres/${OEUVRE_ID}`)
      .send({ titre: 'Nouveau titre' });

    expect(response.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalled();
  });

  it('DELETE /api/v1/admin/oeuvres/:id returns 204', async () => {
    mockDelete.mockResolvedValue(undefined);
    const response = await request(app).delete(`/api/v1/admin/oeuvres/${OEUVRE_ID}`);

    expect(response.status).toBe(204);
  });

  it('POST /api/v1/admin/oeuvres/:id/publish publishes the oeuvre', async () => {
    const response = await request(app).post(`/api/v1/admin/oeuvres/${OEUVRE_ID}/publish`);

    expect(response.status).toBe(200);
    expect(mockPublish).toHaveBeenCalledWith(
      '11111111-1111-1111-1111-111111111111',
      OEUVRE_ID
    );
  });

  it('POST /api/v1/admin/oeuvres/:id/withdraw retires the oeuvre', async () => {
    const response = await request(app).post(`/api/v1/admin/oeuvres/${OEUVRE_ID}/withdraw`);

    expect(response.status).toBe(200);
  });

  it('GET /api/v1/artisan/oeuvres lists my oeuvres', async () => {
    const response = await request(app).get('/api/v1/artisan/oeuvres');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
  });

  it('GET /api/v1/artisan/oeuvres/:id returns my oeuvre', async () => {
    const response = await request(app).get(`/api/v1/artisan/oeuvres/${OEUVRE_ID}`);

    expect(response.status).toBe(200);
    expect(mockGetMy).toHaveBeenCalled();
  });

  it('POST /api/v1/artisan/oeuvres returns 404 (route removed)', async () => {
    const response = await request(app).post('/api/v1/artisan/oeuvres').send({});

    expect(response.status).toBe(404);
  });

  it('PATCH /api/v1/artisan/oeuvres/:id returns 404 (route removed)', async () => {
    const response = await request(app)
      .patch(`/api/v1/artisan/oeuvres/${OEUVRE_ID}`)
      .send({ titre: 'x' });

    expect(response.status).toBe(404);
  });

  it('DELETE /api/v1/artisan/oeuvres/:id returns 404 (route removed)', async () => {
    const response = await request(app).delete(`/api/v1/artisan/oeuvres/${OEUVRE_ID}`);

    expect(response.status).toBe(404);
  });
});
