import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { NotFoundError, ConflictError } from '../../src/common/errors/AppError.js';

const ARTICLE_ID = '123e4567-e89b-12d3-a456-426614174010';
const CATEGORY_ID = '123e4567-e89b-12d3-a456-426614174001';
const ADMIN_USER_ID = '123e4567-e89b-12d3-a456-426614174002';

const makeArticle = (overrides = {}) => ({
  id: ARTICLE_ID,
  titre: 'Mon article',
  contenu: 'Contenu',
  slug: 'mon-article',
  metaDescription: null,
  statut: 'BROUILLON',
  datePublication: null,
  datePlanification: null,
  categorieId: CATEGORY_ID,
  imageCouvertureUrl: null,
  imageCouverturePublicId: null,
  auteurId: '123e4567-e89b-12d3-a456-426614174003',
  publishedByAdminId: null,
  ...overrides,
});

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
  },
}));

vi.mock('../../src/modules/auth/middleware/auth.middleware.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: ADMIN_USER_ID, role: 'ADMIN', adminAccessLevel: 'MODERATEUR' };
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

vi.mock('../../src/config/database.js', () => ({
  prisma: {},
}));

const app = (await import('../../src/app.js')).default;

describe('Routes admin ARTICLES', () => {
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
  });

  it('POST /api/v1/admin/articles creates an article', async () => {
    const res = await request(app).post('/api/v1/admin/articles').send({
      titre: 'Mon article',
      contenu: 'Contenu',
      categorieId: CATEGORY_ID,
    });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('success', true);
    expect(mockCreate).toHaveBeenCalledWith(ADMIN_USER_ID, expect.any(Object));
  });

  it('POST /api/v1/admin/articles returns 400 on missing payload', async () => {
    const res = await request(app).post('/api/v1/admin/articles').send({ titre: '' });

    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('POST /api/v1/admin/articles returns 404 for unknown category', async () => {
    mockCreate.mockRejectedValueOnce(new NotFoundError('CatÃ©gorie non trouvÃ©e'));
    const res = await request(app).post('/api/v1/admin/articles').send({
      titre: 'Mon article',
      contenu: 'Contenu',
      categorieId: CATEGORY_ID,
    });

    expect(res.status).toBe(404);
  });

  it('GET /api/v1/admin/articles lists articles', async () => {
    const res = await request(app).get('/api/v1/admin/articles');

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(mockList).toHaveBeenCalled();
  });

  it('GET /api/v1/admin/articles passes query filters', async () => {
    await request(app).get('/api/v1/admin/articles?statut=BROUILLON&q=art&tri=recent');

    expect(mockList).toHaveBeenCalledWith(
      expect.objectContaining({ statut: 'BROUILLON', q: 'art', tri: 'recent' })
    );
  });

  it('GET /api/v1/admin/articles returns 400 on invalid tri', async () => {
    const res = await request(app).get('/api/v1/admin/articles?tri=invalid');

    expect(res.status).toBe(400);
  });

  it('GET /api/v1/admin/articles/:id returns an article', async () => {
    const res = await request(app).get(`/api/v1/admin/articles/${ARTICLE_ID}`);

    expect(res.status).toBe(200);
    expect(mockGetOne).toHaveBeenCalledWith(ARTICLE_ID);
  });

  it('GET /api/v1/admin/articles/:id returns 404', async () => {
    mockGetOne.mockRejectedValueOnce(new NotFoundError('Article non trouvÃ©'));
    const res = await request(app).get(`/api/v1/admin/articles/${ARTICLE_ID}`);

    expect(res.status).toBe(404);
  });

  it('PATCH /api/v1/admin/articles/:id updates an article', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/articles/${ARTICLE_ID}`)
      .send({ contenu: 'Nouveau contenu' });

    expect(res.status).toBe(200);
    expect(mockUpdate).toHaveBeenCalledWith(ARTICLE_ID, { contenu: 'Nouveau contenu' });
  });

  it('PATCH /api/v1/admin/articles/:id returns 409 when published', async () => {
    mockUpdate.mockRejectedValueOnce(
      new ConflictError('Seuls les articles non publiÃ©s peuvent Ãªtre modifiÃ©s')
    );
    const res = await request(app)
      .patch(`/api/v1/admin/articles/${ARTICLE_ID}`)
      .send({ contenu: 'x' });

    expect(res.status).toBe(409);
  });

  it('DELETE /api/v1/admin/articles/:id returns 204', async () => {
    const res = await request(app).delete(`/api/v1/admin/articles/${ARTICLE_ID}`);

    expect(res.status).toBe(204);
    expect(mockRemove).toHaveBeenCalledWith(ARTICLE_ID);
  });

  it('DELETE /api/v1/admin/articles/:id returns 404', async () => {
    mockRemove.mockRejectedValueOnce(new NotFoundError('Article non trouvÃ©'));
    const res = await request(app).delete(`/api/v1/admin/articles/${ARTICLE_ID}`);

    expect(res.status).toBe(404);
  });

  it('POST /api/v1/admin/articles/:id/publish publishes an article', async () => {
    const res = await request(app).post(`/api/v1/admin/articles/${ARTICLE_ID}/publish`);

    expect(res.status).toBe(200);
    expect(mockPublish).toHaveBeenCalledWith(ADMIN_USER_ID, ARTICLE_ID);
  });

  it('POST /api/v1/admin/articles/:id/publish returns 409 on invalid transition', async () => {
    mockPublish.mockRejectedValueOnce(new ConflictError('Transition de statut non autorisÃ©e'));
    const res = await request(app).post(`/api/v1/admin/articles/${ARTICLE_ID}/publish`);

    expect(res.status).toBe(409);
  });

  it('POST /api/v1/admin/articles/:id/schedule plans an article', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/articles/${ARTICLE_ID}/schedule`)
      .send({ datePlanification: '2030-01-01T00:00:00.000Z' });

    expect(res.status).toBe(200);
    expect(mockSchedule).toHaveBeenCalledWith(ARTICLE_ID, { datePlanification: '2030-01-01T00:00:00.000Z' });
  });

  it('POST /api/v1/admin/articles/:id/schedule returns 400 on missing date', async () => {
    const res = await request(app).post(`/api/v1/admin/articles/${ARTICLE_ID}/schedule`).send({});

    expect(res.status).toBe(400);
    expect(mockSchedule).not.toHaveBeenCalled();
  });

  it('POST /api/v1/admin/articles/:id/unpublish returns an article to draft', async () => {
    const res = await request(app).post(`/api/v1/admin/articles/${ARTICLE_ID}/unpublish`);

    expect(res.status).toBe(200);
    expect(mockUnpublish).toHaveBeenCalledWith(ARTICLE_ID);
  });

  it('POST /api/v1/admin/articles/:id/cover uploads an image', async () => {
    const pngMagic = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const png = Buffer.concat([pngMagic, Buffer.from('fake-image-data')]);

    const res = await request(app)
      .post(`/api/v1/admin/articles/${ARTICLE_ID}/cover`)
      .attach('file', png, {
        filename: 'cover.png',
        contentType: 'image/png',
      });

    expect(res.status).toBe(200);
    expect(mockUploadCover).toHaveBeenCalled();
  });

  it('POST /api/v1/admin/articles/:id/cover returns 400 on unsupported mime', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/articles/${ARTICLE_ID}/cover`)
      .attach('file', Buffer.from('%PDF-'), {
        filename: 'cover.pdf',
        contentType: 'application/pdf',
      });

    expect(res.status).toBe(400);
  });

  it('DELETE /api/v1/admin/articles/:id/cover removes the cover', async () => {
    const res = await request(app).delete(`/api/v1/admin/articles/${ARTICLE_ID}/cover`);

    expect(res.status).toBe(200);
    expect(mockDeleteCover).toHaveBeenCalledWith(ARTICLE_ID);
  });
});

