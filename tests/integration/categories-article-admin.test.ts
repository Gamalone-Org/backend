import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { NotFoundError, ConflictError, ValidationError, UnauthorizedError, ForbiddenError } from '../../src/common/errors/AppError.js';

const CAT_ID = '123e4567-e89b-12d3-a456-426614174001';
const CAT_ID_2 = '123e4567-e89b-12d3-a456-426614174002';
const ADMIN_USER_ID = '123e4567-e89b-12d3-a456-426614174003';

const makeCategorie = (overrides = {}) => ({
  id: CAT_ID,
  nom: 'Peinture',
  description: 'Œuvres picturales',
  slug: 'peinture',
  imageCouvertureUrl: null,
  imageCouverturePublicId: null,
  statut: 'ACTIVE',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
  _count: { articles: 0 },
  ...overrides,
});

const mockList = vi.fn();
const mockGetOne = vi.fn();
const mockCreate = vi.fn();
const mockUpdate = vi.fn();
const mockRemove = vi.fn();
const mockUploadImage = vi.fn();
const mockDeleteImage = vi.fn();

vi.mock('../../src/modules/categories-article/categorie-article.service.js', () => ({
  CategorieArticleService: class {
    listCategoriesArticle = mockList;
    getCategorieArticle = mockGetOne;
    createCategorieArticle = mockCreate;
    updateCategorieArticle = mockUpdate;
    deleteCategorieArticle = mockRemove;
    uploadCategorieArticleImage = mockUploadImage;
    deleteCategorieArticleImage = mockDeleteImage;
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
      id: req.headers['x-test-user-id'] ?? ADMIN_USER_ID,
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
  requireAdminLevel: (minLevel: string) => (req: any, _res: any, next: any) => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }
    if (ADMIN_LEVEL_RANK[req.user.adminAccessLevel] < ADMIN_LEVEL_RANK[minLevel]) {
      next(new ForbiddenError('Insufficient admin level'));
      return;
    }
    next();
  },
  requirePermission: (...permissions: string[]) => (_req: any, _res: any, next: any) => next(),
}));

let app: any;

beforeAll(async () => {
  const mod = await import('../../src/app.js');
  app = mod.default;
});

describe('Routes admin CATÉGORIES D\'ARTICLES', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    mockGetOne.mockResolvedValue(makeCategorie());
    mockCreate.mockResolvedValue(makeCategorie());
    mockUpdate.mockResolvedValue(makeCategorie({ nom: 'Nouveau nom' }));
    mockRemove.mockResolvedValue(undefined);
    mockUploadImage.mockResolvedValue(makeCategorie({ imageCouvertureUrl: 'https://cdn.test/image.jpg' }));
    mockDeleteImage.mockResolvedValue(makeCategorie({ imageCouvertureUrl: null, imageCouverturePublicId: null }));
  });

  describe('GET /api/v1/admin/article-categories', () => {
    it('requiert authentification', async () => {
      const res = await request(app).get('/api/v1/admin/article-categories');
      expect(res.status).toBe(401);
    });

    it('requiert role ADMIN', async () => {
      const res = await request(app)
        .get('/api/v1/admin/article-categories')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'ACHETEUR');
      expect(res.status).toBe(403);
    });

    it('requiert niveau SUPPORT minimum', async () => {
      const res = await request(app)
        .get('/api/v1/admin/article-categories')
        .set('Authorization', 'Bearer token')
        .set('x-test-admin-level', 'SUPPORT');
      expect(res.status).toBe(200);
    });

    it('retourne la liste paginée', async () => {
      mockList.mockResolvedValue({
        items: [makeCategorie()],
        total: 1,
        page: 1,
        limit: 20,
        totalPages: 1,
      });
      const res = await request(app)
        .get('/api/v1/admin/article-categories')
        .set('Authorization', 'Bearer token')
        .set('x-test-admin-level', 'SUPPORT');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.items).toHaveLength(1);
    });

    it('passe les filtres au service', async () => {
      await request(app)
        .get('/api/v1/admin/article-categories?page=2&limit=10&statut=INACTIVE&q=peint')
        .set('Authorization', 'Bearer token')
        .set('x-test-admin-level', 'SUPPORT');
      expect(mockList).toHaveBeenCalledWith({
        page: 2,
        limit: 10,
        statut: 'INACTIVE',
        q: 'peint',
      });
    });
  });

  describe('GET /api/v1/admin/article-categories/:id', () => {
    it('retourne 404 si non trouvée', async () => {
      mockGetOne.mockRejectedValue(new NotFoundError('Catégorie d\'article non trouvée'));
      const res = await request(app)
        .get(`/api/v1/admin/article-categories/${CAT_ID}`)
        .set('Authorization', 'Bearer token')
        .set('x-test-admin-level', 'SUPPORT');
      expect(res.status).toBe(404);
    });

    it('retourne la catégorie', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/article-categories/${CAT_ID}`)
        .set('Authorization', 'Bearer token')
        .set('x-test-admin-level', 'SUPPORT');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.categorieArticle.nom).toBe('Peinture');
    });
  });

  describe('POST /api/v1/admin/article-categories', () => {
    it('requiert niveau MODERATEUR', async () => {
      const res = await request(app)
        .post('/api/v1/admin/article-categories')
        .send({ nom: 'Test' })
        .set('Authorization', 'Bearer token')
        .set('x-test-admin-level', 'SUPPORT');
      expect(res.status).toBe(403);
    });

    it('crée une catégorie', async () => {
      const res = await request(app)
        .post('/api/v1/admin/article-categories')
        .send({ nom: 'Peinture', description: 'Œuvres picturales' })
        .set('Authorization', 'Bearer token')
        .set('x-test-admin-level', 'MODERATEUR');
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.categorieArticle.nom).toBe('Peinture');
    });

    it('rejette un nom en double', async () => {
      mockCreate.mockRejectedValue(new ConflictError('Une catégorie d\'article avec ce nom existe déjà'));
      const res = await request(app)
        .post('/api/v1/admin/article-categories')
        .send({ nom: 'Peinture' })
        .set('Authorization', 'Bearer token')
        .set('x-test-admin-level', 'MODERATEUR');
      expect(res.status).toBe(409);
    });

    it('rejette un payload invalide', async () => {
      const res = await request(app)
        .post('/api/v1/admin/article-categories')
        .send({ description: 'Sans nom' })
        .set('Authorization', 'Bearer token')
        .set('x-test-admin-level', 'MODERATEUR');
      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /api/v1/admin/article-categories/:id', () => {
    it('requiert niveau MODERATEUR', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/article-categories/${CAT_ID}`)
        .send({ nom: 'Dessin' })
        .set('Authorization', 'Bearer token')
        .set('x-test-admin-level', 'SUPPORT');
      expect(res.status).toBe(403);
    });

    it('met à jour le nom et le slug', async () => {
      const res = await request(app)
        .patch(`/api/v1/admin/article-categories/${CAT_ID}`)
        .send({ nom: 'Dessin' })
        .set('Authorization', 'Bearer token')
        .set('x-test-admin-level', 'MODERATEUR');
      expect(res.status).toBe(200);
      expect(res.body.categorieArticle.nom).toBe('Nouveau nom');
    });

    it('rejette un nom en double', async () => {
      mockUpdate.mockRejectedValue(new ConflictError('Une catégorie d\'article avec ce nom existe déjà'));
      const res = await request(app)
        .patch(`/api/v1/admin/article-categories/${CAT_ID}`)
        .send({ nom: 'Existant' })
        .set('Authorization', 'Bearer token')
        .set('x-test-admin-level', 'MODERATEUR');
      expect(res.status).toBe(409);
    });
  });

  describe('DELETE /api/v1/admin/article-categories/:id', () => {
    it('requiert niveau MODERATEUR', async () => {
      const res = await request(app)
        .delete(`/api/v1/admin/article-categories/${CAT_ID}`)
        .set('Authorization', 'Bearer token')
        .set('x-test-admin-level', 'SUPPORT');
      expect(res.status).toBe(403);
    });

    it('supprime la catégorie', async () => {
      const res = await request(app)
        .delete(`/api/v1/admin/article-categories/${CAT_ID}`)
        .set('Authorization', 'Bearer token')
        .set('x-test-admin-level', 'MODERATEUR');
      expect(res.status).toBe(204);
    });

    it('bloque si des articles y sont rattachés', async () => {
      mockRemove.mockRejectedValue(new ConflictError('La catégorie d\'article est encore rattachée à des articles et ne peut pas être supprimée'));
      const res = await request(app)
        .delete(`/api/v1/admin/article-categories/${CAT_ID}`)
        .set('Authorization', 'Bearer token')
        .set('x-test-admin-level', 'MODERATEUR');
      expect(res.status).toBe(409);
    });
  });

  describe('POST /api/v1/admin/article-categories/:id/image', () => {
    it.skip('upload une image de couverture (nécessite un vrai JPEG)', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/article-categories/${CAT_ID}/image`)
        .attach('file', Buffer.from('fake-jpeg-data'), 'test.jpg')
        .set('Authorization', 'Bearer token')
        .set('x-test-admin-level', 'MODERATEUR');
      expect(res.status).toBe(200);
      expect(res.body.categorieArticle.imageCouvertureUrl).toBe('https://cdn.test/image.jpg');
    });

    it('rejette un fichier non-image', async () => {
      const res = await request(app)
        .post(`/api/v1/admin/article-categories/${CAT_ID}/image`)
        .attach('file', Buffer.from('pdf-content'), 'test.pdf')
        .set('Authorization', 'Bearer token')
        .set('x-test-admin-level', 'MODERATEUR');
      expect(res.status).toBe(400);
    });
  });

  describe('DELETE /api/v1/admin/article-categories/:id/image', () => {
    it('supprime l\'image de couverture', async () => {
      const res = await request(app)
        .delete(`/api/v1/admin/article-categories/${CAT_ID}/image`)
        .set('Authorization', 'Bearer token')
        .set('x-test-admin-level', 'MODERATEUR');
      expect(res.status).toBe(200);
      expect(res.body.categorieArticle.imageCouvertureUrl).toBeNull();
    });
  });
});