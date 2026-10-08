import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { NotFoundError } from '../../src/common/errors/AppError.js';

const ARTICLE_ID = '123e4567-e89b-12d3-a456-426614174010';
const CATEGORY_ID = '123e4567-e89b-12d3-a456-426614174001';

const makePublicArticle = (overrides: Record<string, unknown> = {}) => ({
  id: ARTICLE_ID,
  titre: 'Le bronze au Togo',
  slug: 'le-bronze-au-togo',
  metaDescription: 'Un savoir-faire',
  contenu: 'Contenu complet',
  imageCouvertureUrl: null,
  datePublication: '2026-06-15T10:00:00.000Z',
  createdAt: '2026-06-01T10:00:00.000Z',
  updatedAt: '2026-06-15T10:00:00.000Z',
  categorie: { id: CATEGORY_ID, nom: 'Artisanat', slug: 'artisanat' },
  ...overrides,
});

const mockListPublic = vi.fn();
const mockGetPublic = vi.fn();

vi.mock('../../src/modules/articles/article.service.js', () => ({
  ArticleService: class {
    listPublicArticles = mockListPublic;
    getPublicArticle = mockGetPublic;
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

describe('Routes publiques ARTICLES — visibilité PUBLIE (Integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListPublic.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
    mockGetPublic.mockResolvedValue(makePublicArticle());
  });

  it('liste les articles sans authentification (200)', async () => {
    const res = await request(app).get('/api/v1/articles');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockListPublic).toHaveBeenCalled();
  });

  it('transmet les filtres publics (categorieId, q, pagination)', async () => {
    await request(app).get(
      `/api/v1/articles?categorieId=${CATEGORY_ID}&q=bronze&page=2&limit=5`
    );

    expect(mockListPublic).toHaveBeenCalledWith(
      expect.objectContaining({ categorieId: CATEGORY_ID, q: 'bronze', page: 2, limit: 5 })
    );
  });

  it('refuse un categorieId non uuid (400)', async () => {
    const res = await request(app).get('/api/v1/articles?categorieId=not-a-uuid');

    expect(res.status).toBe(400);
    expect(mockListPublic).not.toHaveBeenCalled();
  });

  it('refuse un filtre statut sur la route publique (400)', async () => {
    const res = await request(app).get('/api/v1/articles?statut=BROUILLON');

    expect(res.status).toBe(400);
    expect(mockListPublic).not.toHaveBeenCalled();
  });

  it('retourne le détail public d\u2019un article publié (200)', async () => {
    const res = await request(app).get(`/api/v1/articles/${ARTICLE_ID}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.article.slug).toBe('le-bronze-au-togo');
    expect(mockGetPublic).toHaveBeenCalledWith(ARTICLE_ID);
  });

  it('retourne 400 pour un identifiant non uuid', async () => {
    const res = await request(app).get('/api/v1/articles/not-a-uuid');

    expect(res.status).toBe(400);
    expect(mockGetPublic).not.toHaveBeenCalled();
  });

  it('retourne 404 pour un article brouillon / planifié / inexistant', async () => {
    mockGetPublic.mockRejectedValueOnce(new NotFoundError('Article non trouvé'));

    const res = await request(app).get(`/api/v1/articles/${ARTICLE_ID}`);

    expect(res.status).toBe(404);
  });
});
