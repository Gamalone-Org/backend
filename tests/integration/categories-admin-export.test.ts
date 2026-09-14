import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { ForbiddenError, UnauthorizedError } from '../../src/common/errors/AppError.js';

const mockList = vi.fn();
const mockListPublic = vi.fn();
const mockGetOne = vi.fn();
const mockGetOnePublic = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockRemove = vi.fn();
const mockUploadImage = vi.fn();
const mockDeleteImage = vi.fn();
const mockCreateSous = vi.fn();
const mockUpdateSous = vi.fn();
const mockDeleteSous = vi.fn();
const mockUploadSousImage = vi.fn();
const mockDeleteSousImage = vi.fn();
const mockListSousPublic = vi.fn();
const mockExport = vi.fn();

vi.mock('../../src/modules/categories/categorie.service.js', () => ({
  CategorieService: class {
    listCategories = mockList;
    listPublicCategories = mockListPublic;
    getCategorie = mockGetOne;
    getPublicCategorie = mockGetOnePublic;
    createCategorie = mockCreate;
    updateCategorie = mockUpdate;
    deleteCategorie = mockRemove;
    uploadCategorieImage = mockUploadImage;
    deleteCategorieImage = mockDeleteImage;
    createSousCategorie = mockCreateSous;
    updateSousCategorie = mockUpdateSous;
    deleteSousCategorie = mockDeleteSous;
    uploadSousCategorieImage = mockUploadSousImage;
    deleteSousCategorieImage = mockDeleteSousImage;
    listPublicSousCategories = mockListSousPublic;
    exportCsv = mockExport;
  },
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

vi.mock('../../src/config/database.js', () => ({
  prisma: {},
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

const CATEGORIE_ID = '123e4567-e89b-12d3-a456-426614174001';
const SOUS_CATEGORIE_ID = '123e4567-e89b-12d3-a456-426614174002';

const makeCategorie = (overrides: Record<string, unknown> = {}) => ({
  id: CATEGORIE_ID,
  nom: 'Sculpture',
  description: 'Art du bois',
  slug: 'sculpture',
  statut: 'ACTIVE',
  position: 1,
  imageCouvertureUrl: null,
  imageCouverturePublicId: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  _count: { oeuvres: 0 },
  ...overrides,
});

const authHeaders = (level: string, role = 'ADMIN') => ({
  Authorization: 'Bearer token',
  'x-test-role': role,
  'x-test-admin-level': level,
});

describe('Routes admin CATÃ‰GORIES â€” export & permissions (Integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    mockListPublic.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    mockGetOne.mockResolvedValue(makeCategorie());
    mockGetOnePublic.mockResolvedValue(makeCategorie());
    mockCreate.mockResolvedValue(makeCategorie());
    mockUpdate.mockResolvedValue(makeCategorie({ nom: 'Nouveau' }));
    mockRemove.mockResolvedValue(makeCategorie());
    mockCreateSous.mockResolvedValue({
      id: SOUS_CATEGORIE_ID,
      nom: 'Bois',
      categorieId: CATEGORIE_ID,
    });
    mockUpdateSous.mockResolvedValue({ id: SOUS_CATEGORIE_ID, nom: 'Bois dur' });
    mockDeleteSous.mockResolvedValue({ id: SOUS_CATEGORIE_ID });
    mockListSousPublic.mockResolvedValue([]);
    mockExport.mockResolvedValue('"id","nom"\n"1","Sculpture"\n');
  });

  // ---- AUTH ----

  it('requires authentication to list categories (401)', async () => {
    const res = await request(app).get('/api/v1/admin/categories');
    expect(res.status).toBe(401);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('requires authentication to export categories (401)', async () => {
    const res = await request(app).get('/api/v1/admin/categories/export');
    expect(res.status).toBe(401);
    expect(mockExport).not.toHaveBeenCalled();
  });

  it('forbids a non-ADMIN role from listing categories (403)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/categories')
      .set('Authorization', 'Bearer token')
      .set('x-test-user-id', 'acheteur-1')
      .set('x-test-role', 'ACHETEUR');

    expect(res.status).toBe(403);
    expect(mockList).not.toHaveBeenCalled();
  });

  // ---- NIVEAUX : SUPPORT (lecture) ----

  it('SUPPORT is allowed to list categories (200) avec totalPages', async () => {
    mockList.mockResolvedValue({
      items: [makeCategorie()],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    const res = await request(app)
      .get('/api/v1/admin/categories')
      .set(authHeaders('SUPPORT'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.totalPages).toBe(1);
  });

  it('SUPPORT is allowed to get a category detail (200)', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/categories/${CATEGORIE_ID}`)
      .set(authHeaders('SUPPORT'));

    expect(res.status).toBe(200);
    expect(mockGetOne).toHaveBeenCalledWith(CATEGORIE_ID);
  });

  it('SUPPORT is allowed to export categories as CSV (200)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/categories/export')
      .set(authHeaders('SUPPORT'));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toMatch(/categories-\d+\.csv/);
    expect(res.text).toBe('"id","nom"\n"1","Sculpture"\n');
    expect(mockExport).toHaveBeenCalled();
  });

  // ---- NIVEAUX : Ã©criture ----

  it('forbids SUPPORT from creating a category (403)', async () => {
    const res = await request(app)
      .post('/api/v1/admin/categories')
      .set(authHeaders('SUPPORT'))
      .send({ nom: 'Peinture' });

    expect(res.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('MODERATEUR can create a category (201)', async () => {
    const res = await request(app)
      .post('/api/v1/admin/categories')
      .set(authHeaders('MODERATEUR'))
      .send({ nom: 'Peinture', description: 'Sur toile' });

    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith(expect.objectContaining({ nom: 'Peinture' }));
  });

  it('SUPER_ADMIN inherits the create permission (201)', async () => {
    const res = await request(app)
      .post('/api/v1/admin/categories')
      .set(authHeaders('SUPER_ADMIN'))
      .send({ nom: 'CÃ©ramique' });

    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalled();
  });

  it('forbids SUPPORT from creating a sous-category (403)', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/categories/${CATEGORIE_ID}/sous-categories`)
      .set(authHeaders('SUPPORT'))
      .send({ nom: 'Bois' });

    expect(res.status).toBe(403);
    expect(mockCreateSous).not.toHaveBeenCalled();
  });

  // ---- ROUTES : /export AVANT /:id ----

  it('routes /export before /:id so the id param is not matched', async () => {
    const res = await request(app)
      .get('/api/v1/admin/categories/export')
      .set(authHeaders('SUPPORT'));

    expect(res.status).toBe(200);
    expect(mockExport).toHaveBeenCalledTimes(1);
    expect(mockGetOne).not.toHaveBeenCalled();
  });

  it('still routes a UUID to the detail handler', async () => {
    await request(app)
      .get(`/api/v1/admin/categories/${CATEGORIE_ID}`)
      .set(authHeaders('SUPPORT'));

    expect(mockGetOne).toHaveBeenCalledWith(CATEGORIE_ID);
    expect(mockExport).not.toHaveBeenCalled();
  });

  // ---- VALIDATION ----

  it('returns 400 for an invalid statut filter', async () => {
    const res = await request(app)
      .get('/api/v1/admin/categories')
      .set(authHeaders('SUPPORT'))
      .query({ statut: 'INVALIDE' });

    expect(res.status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid page value', async () => {
    const res = await request(app)
      .get('/api/v1/admin/categories')
      .set(authHeaders('SUPPORT'))
      .query({ page: 0 });

    expect(res.status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid limit value', async () => {
    const res = await request(app)
      .get('/api/v1/admin/categories')
      .set(authHeaders('SUPPORT'))
      .query({ limit: 0 });

    expect(res.status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('forbids an invalid category id in the detail path (400)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/categories/not-a-uuid')
      .set(authHeaders('SUPPORT'));

    expect(res.status).toBe(400);
    expect(mockGetOne).not.toHaveBeenCalled();
  });

  // ---- FILTRES & PAGINATION ----

  it('returns totalPages = 0 when total = 0', async () => {
    const res = await request(app)
      .get('/api/v1/admin/categories')
      .set(authHeaders('SUPPORT'));

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.totalPages).toBe(0);
  });

  it('propagates export filters without pagination (200)', async () => {
    await request(app)
      .get('/api/v1/admin/categories/export')
      .set(authHeaders('SUPPORT'))
      .query({ q: 'sculp', statut: 'ACTIVE' });

    expect(mockExport).toHaveBeenCalledWith({ statut: 'ACTIVE', q: 'sculp' });
  });

  it('propagates the list filters (200)', async () => {
    await request(app)
      .get('/api/v1/admin/categories')
      .set(authHeaders('SUPPORT'))
      .query({ q: 'bois', statut: 'INACTIVE', page: 2, limit: 10 });

    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'bois', statut: 'INACTIVE', page: 2, limit: 10 })
    );
  });

  // ---- SOUS-CATÃ‰GORIES : intÃ©gritÃ© categorieId ----

  it('PATCH passes the categorieId and the sousCategorieId to the service (200)', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/categories/${CATEGORIE_ID}/sous-categories/${SOUS_CATEGORIE_ID}`)
      .set(authHeaders('MODERATEUR'))
      .send({ nom: 'Bois dur' });

    expect(res.status).toBe(200);
    expect(mockUpdateSous).toHaveBeenCalledWith(
      CATEGORIE_ID,
      SOUS_CATEGORIE_ID,
      expect.objectContaining({ nom: 'Bois dur' })
    );
  });

  it('DELETE passes the categorieId and the sousCategorieId to the service (204)', async () => {
    const res = await request(app)
      .delete(`/api/v1/admin/categories/${CATEGORIE_ID}/sous-categories/${SOUS_CATEGORIE_ID}`)
      .set(authHeaders('MODERATEUR'));

    expect(res.status).toBe(204);
    expect(mockDeleteSous).toHaveBeenCalledWith(CATEGORIE_ID, SOUS_CATEGORIE_ID);
  });

  it('returns 400 for an invalid sousCategorieId (400)', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/categories/${CATEGORIE_ID}/sous-categories/not-a-uuid`)
      .set(authHeaders('MODERATEUR'))
      .send({ nom: 'Bois' });

    expect(res.status).toBe(400);
    expect(mockUpdateSous).not.toHaveBeenCalled();
  });
});
