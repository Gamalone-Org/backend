import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { ForbiddenError, UnauthorizedError } from '../../src/common/errors/AppError.js';

const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockRemove = vi.fn();
const mockPublish = vi.fn();
const mockSchedule = vi.fn();
const mockUnpublish = vi.fn();
const mockGetOne = vi.fn();
const mockList = vi.fn();
const mockUploadCover = vi.fn();
const mockDeleteCover = vi.fn();
const mockExport = vi.fn();

vi.mock('../../src/modules/articles/article.service.js', () => ({
  ArticleService: class {
    createArticle = mockCreate;
    updateArticle = mockUpdate;
    deleteArticle = mockRemove;
    publishArticle = mockPublish;
    scheduleArticle = mockSchedule;
    unpublishArticle = mockUnpublish;
    getArticle = mockGetOne;
    listArticles = mockList;
    uploadArticleCover = mockUploadCover;
    deleteArticleCover = mockDeleteCover;
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

const ARTICLE_ID = '123e4567-e89b-12d3-a456-426614174010';
const CATEGORIE_ID = '123e4567-e89b-12d3-a456-426614174001';
const AUTEUR_ID = '123e4567-e89b-12d3-a456-426614174002';

const makeArticle = (overrides: Record<string, unknown> = {}) => ({
  id: ARTICLE_ID,
  titre: 'Mon article',
  contenu: 'Contenu',
  slug: 'mon-article',
  metaDescription: null,
  statut: 'BROUILLON',
  datePublication: null,
  datePlanification: null,
  categorieId: CATEGORIE_ID,
  imageCouvertureUrl: null,
  imageCouverturePublicId: null,
  auteurId: AUTEUR_ID,
  publishedByAdminId: null,
  deletedAt: null,
  ...overrides,
});

describe('Routes admin ARTICLES - export & permissions (Integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue(makeArticle());
    mockUpdate.mockResolvedValue(makeArticle({ titre: 'Nouveau' }));
    mockRemove.mockResolvedValue(makeArticle({ deletedAt: new Date() }));
    mockPublish.mockResolvedValue(makeArticle({ statut: 'PUBLIE', datePublication: new Date() }));
    mockSchedule.mockResolvedValue(
      makeArticle({ statut: 'PLANIFIE', datePlanification: new Date('2030-01-01') })
    );
    mockUnpublish.mockResolvedValue(makeArticle({ statut: 'BROUILLON' }));
    mockGetOne.mockResolvedValue(makeArticle());
    mockList.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
    mockUploadCover.mockResolvedValue(makeArticle({ imageCouvertureUrl: 'https://x' }));
    mockDeleteCover.mockResolvedValue(makeArticle());
    mockExport.mockResolvedValue('"id","titre"\n"1","Mon article"\n');
  });

  // ---- AUTH ----

  it('requires authentication to list articles (401)', async () => {
    const res = await request(app).get('/api/v1/admin/articles');
    expect(res.status).toBe(401);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('requires authentication to export articles (401)', async () => {
    const res = await request(app).get('/api/v1/admin/articles/export');
    expect(res.status).toBe(401);
    expect(mockExport).not.toHaveBeenCalled();
  });

  it('forbids a non-ADMIN role from exporting articles (403)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/articles/export')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ACHETEUR');

    expect(res.status).toBe(403);
    expect(mockExport).not.toHaveBeenCalled();
  });

  // ---- NIVEAUX : SUPPORT ----

  it('SUPPORT is allowed to list articles (200)', async () => {
    mockList.mockResolvedValue({
      items: [{ id: ARTICLE_ID, titre: 'Mon article', statut: 'BROUILLON' }],
      total: 1,
      page: 1,
      limit: 20,
    });

    const res = await request(app)
      .get('/api/v1/admin/articles')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'SUPPORT');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockList).toHaveBeenCalled();
  });

  it('SUPPORT is allowed to get an article detail (200)', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/articles/${ARTICLE_ID}`)
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'SUPPORT');

    expect(res.status).toBe(200);
    expect(mockGetOne).toHaveBeenCalledWith(ARTICLE_ID);
  });

  it('SUPPORT is allowed to export articles as CSV (200)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/articles/export')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'SUPPORT');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toMatch(/articles-\d+\.csv/);
    expect(mockExport).toHaveBeenCalled();
  });

  // ---- NIVEAUX : MODERATEUR ----

  it('MODERATEUR preserves the write access (create 201)', async () => {
    const res = await request(app)
      .post('/api/v1/admin/articles')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'MODERATEUR')
      .send({ titre: 'Mon article', contenu: 'Contenu', categorieId: CATEGORIE_ID });

    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith('admin-1', expect.any(Object));
  });

  it('MODERATEUR preserves the publish access (200)', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/articles/${ARTICLE_ID}/publish`)
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'MODERATEUR');

    expect(res.status).toBe(200);
    expect(mockPublish).toHaveBeenCalledWith('admin-1', ARTICLE_ID);
  });

  it('SUPPORT is forbidden from creating an article (403)', async () => {
    const res = await request(app)
      .post('/api/v1/admin/articles')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'SUPPORT')
      .send({ titre: 'Mon article', contenu: 'Contenu', categorieId: CATEGORIE_ID });

    expect(res.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  // ---- /export AVANT /:id ----

  it('routes /export before /:id so the id param is not matched', async () => {
    const res = await request(app)
      .get('/api/v1/admin/articles/export')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'SUPPORT');

    expect(res.status).toBe(200);
    expect(mockExport).toHaveBeenCalledTimes(1);
    expect(mockGetOne).not.toHaveBeenCalled();
  });

  it('still routes a UUID to the detail handler', async () => {
    await request(app)
      .get(`/api/v1/admin/articles/${ARTICLE_ID}`)
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'SUPPORT');

    expect(mockGetOne).toHaveBeenCalledWith(ARTICLE_ID);
    expect(mockExport).not.toHaveBeenCalled();
  });

  // ---- FILTRES : EXPORT ----

  it('passes the list filters to the export service', async () => {
    const res = await request(app)
      .get('/api/v1/admin/articles/export')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'SUPPORT')
      .query({
        q: 'cire perdue',
        statut: 'BROUILLON',
        categorieId: CATEGORIE_ID,
        auteurId: AUTEUR_ID,
        dateDebut: '2026-01-01T00:00:00.000Z',
        dateFin: '2026-12-31T23:59:59.999Z',
      });

    expect(res.status).toBe(200);
    expect(mockExport).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      statut: 'BROUILLON',
      categorieId: CATEGORIE_ID,
      auteurId: AUTEUR_ID,
      dateDebut: new Date('2026-01-01T00:00:00.000Z'),
      dateFin: new Date('2026-12-31T23:59:59.999Z'),
      q: 'cire perdue',
      tri: undefined,
    });
  });

  it('passes a single date bound to the export service', async () => {
    await request(app)
      .get('/api/v1/admin/articles/export')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'SUPPORT')
      .query({ dateDebut: '2026-01-01T00:00:00.000Z' });

    expect(mockExport).toHaveBeenCalledWith(
      expect.objectContaining({ dateDebut: new Date('2026-01-01T00:00:00.000Z') })
    );
  });

  it('forwards q with special characters untouched', async () => {
    await request(app)
      .get('/api/v1/admin/articles/export')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'SUPPORT')
      .query({ q: 'Ã©bÃ©nisterie d\u2019art' });

    expect(mockExport).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'Ã©bÃ©nisterie d\u2019art' })
    );
  });

  it('returns 400 for an invalid auteurId UUID', async () => {
    const res = await request(app)
      .get('/api/v1/admin/articles/export')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'SUPPORT')
      .query({ auteurId: 'not-a-uuid' });

    expect(res.status).toBe(400);
    expect(mockExport).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid categorieId UUID', async () => {
    const res = await request(app)
      .get('/api/v1/admin/articles/export')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'SUPPORT')
      .query({ categorieId: 'not-a-uuid' });

    expect(res.status).toBe(400);
    expect(mockExport).not.toHaveBeenCalled();
  });

  it('returns 400 for an invalid date value', async () => {
    const res = await request(app)
      .get('/api/v1/admin/articles/export')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'SUPPORT')
      .query({ dateDebut: 'not-a-date' });

    expect(res.status).toBe(400);
    expect(mockExport).not.toHaveBeenCalled();
  });

  it('returns 400 when dateDebut is after dateFin', async () => {
    const res = await request(app)
      .get('/api/v1/admin/articles/export')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'SUPPORT')
      .query({
        dateDebut: '2026-12-31T23:59:59.999Z',
        dateFin: '2026-01-01T00:00:00.000Z',
      });

    expect(res.status).toBe(400);
    expect(mockExport).not.toHaveBeenCalled();
  });

  // ---- FILTRES : LISTE ----

  it('forwards the new filters from the list endpoint', async () => {
    await request(app)
      .get('/api/v1/admin/articles')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .set('x-test-admin-level', 'SUPPORT')
      .query({
        statut: 'PUBLIE',
        auteurId: AUTEUR_ID,
        dateDebut: '2026-01-01T00:00:00.000Z',
        q: 'bois',
      });

    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({
        statut: 'PUBLIE',
        auteurId: AUTEUR_ID,
        dateDebut: new Date('2026-01-01T00:00:00.000Z'),
        q: 'bois',
      })
    );
  });
});
