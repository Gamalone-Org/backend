import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { NotFoundError } from '../../src/common/errors/AppError.js';

const mockList = vi.fn();
const mockListPublic = vi.fn();
const mockGetOne = vi.fn();
const mockGetOnePublic = vi.fn();
const mockListSousPublic = vi.fn();

vi.mock('../../src/modules/categories/categorie.service.js', () => ({
  CategorieService: class {
    listCategories = mockList;
    listPublicCategories = mockListPublic;
    getCategorie = mockGetOne;
    getPublicCategorie = mockGetOnePublic;
    listPublicSousCategories = mockListSousPublic;
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

const CATEGORIE_ID = '123e4567-e89b-12d3-a456-426614174001';

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

describe('Routes publiques CATÉGORIES — visibilité ACTIVE (Integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListPublic.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    mockGetOnePublic.mockResolvedValue(makeCategorie());
    mockListSousPublic.mockResolvedValue([]);
  });

  it('lists categories publicly without authentication (200)', async () => {
    const res = await request(app).get('/api/v1/categories');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.totalPages).toBe(0);
    expect(mockListPublic).toHaveBeenCalled();
    expect(mockList).not.toHaveBeenCalled();
  });

  it('propagates the public searches without statut', async () => {
    await request(app).get('/api/v1/categories?q=sculp&page=2&limit=10');

    expect(mockListPublic).toHaveBeenCalledWith(
      expect.objectContaining({ q: 'sculp', page: 2, limit: 10 })
    );
    expect(mockList).not.toHaveBeenCalled();
  });

  it('returns the detail of an ACTIVE category without authentication (200)', async () => {
    const res = await request(app).get(`/api/v1/categories/${CATEGORIE_ID}`);

    expect(res.status).toBe(200);
    expect(mockGetOnePublic).toHaveBeenCalledWith(CATEGORIE_ID);
    expect(mockGetOne).not.toHaveBeenCalled();
  });

  it('returns 404 when the category is not publicly visible (INACTIVE)', async () => {
    mockGetOnePublic.mockRejectedValueOnce(new NotFoundError('Catégorie non trouvée'));

    const res = await request(app).get(`/api/v1/categories/${CATEGORIE_ID}`);

    expect(res.status).toBe(404);
  });

  it('lists only the ACTIVE sous-categories of an ACTIVE category (200)', async () => {
    mockListSousPublic.mockResolvedValue([{ id: 'sc-1', nom: 'Bois' }]);

    const res = await request(app).get(`/api/v1/categories/${CATEGORIE_ID}/sous-categories`);

    expect(res.status).toBe(200);
    expect(mockListSousPublic).toHaveBeenCalledWith(CATEGORIE_ID);
    expect(res.body.sousCategories).toHaveLength(1);
  });

  it('returns 404 for sous-categories when the category is INACTIVE', async () => {
    mockListSousPublic.mockRejectedValueOnce(new NotFoundError('Catégorie non trouvée'));

    const res = await request(app).get(`/api/v1/categories/${CATEGORIE_ID}/sous-categories`);

    expect(res.status).toBe(404);
  });

  it('lists publicly even when the consumer is not an admin role', async () => {
    const res = await request(app)
      .get('/api/v1/categories')
      .set('x-test-role', 'ACHETEUR');

    expect(res.status).toBe(200);
    expect(mockListPublic).toHaveBeenCalled();
  });
});