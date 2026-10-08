import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const mockListPublic = vi.fn();
const mockListAdmin = vi.fn();

vi.mock('../../src/modules/categories-article/categorie-article.service.js', () => ({
  CategorieArticleService: class {
    listPublicCategoriesArticle = mockListPublic;
    listCategoriesArticle = mockListAdmin;
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

const app = (await import('../../src/app.js')).default;

describe('Routes publiques CATÉGORIES D\u2019ARTICLES — visibilité ACTIVE (Integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListPublic.mockResolvedValue({
      items: [],
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
    });
  });

  it('liste les catégories actives sans authentification (200)', async () => {
    const res = await request(app).get('/api/v1/article-categories');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.totalPages).toBe(0);
    expect(mockListPublic).toHaveBeenCalled();
    expect(mockListAdmin).not.toHaveBeenCalled();
  });

  it('transmet la pagination et la recherche q', async () => {
    await request(app).get('/api/v1/article-categories?page=2&limit=10&q=peint');

    expect(mockListPublic).toHaveBeenCalledWith(
      expect.objectContaining({ page: 2, limit: 10, q: 'peint' })
    );
    expect(mockListAdmin).not.toHaveBeenCalled();
  });

  it('refuse un filtre statut sur la route publique (400)', async () => {
    const res = await request(app).get('/api/v1/article-categories?statut=INACTIVE');

    expect(res.status).toBe(400);
    expect(mockListPublic).not.toHaveBeenCalled();
  });

  it('reste accessible avec un rôle non admin', async () => {
    const res = await request(app)
      .get('/api/v1/article-categories')
      .set('x-test-role', 'ACHETEUR');

    expect(res.status).toBe(200);
    expect(mockListPublic).toHaveBeenCalled();
  });
});
