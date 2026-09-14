import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import {
  ForbiddenError,
  UnauthorizedError,
} from '../../src/common/errors/AppError.js';

const mockExportCsv = vi.fn();
const mockAllAdmin = vi.fn();
const mockGetAdmin = vi.fn();

vi.mock('../../src/modules/marketplace/oeuvre.service.js', () => ({
  OeuvreService: class {
    createOeuvre = vi.fn();
    getMyOeuvres = vi.fn();
    getMyOeuvre = vi.fn();
    updateOeuvre = vi.fn();
    deleteOeuvre = vi.fn();
    publishOeuvre = vi.fn();
    withdrawOeuvreAdmin = vi.fn();
    getAllAdmin = mockAllAdmin;
    getOeuvreAdmin = mockGetAdmin;
    exportCsv = mockExportCsv;
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
      adminAccessLevel: req.headers['x-test-access-level'] ?? 'SUPPORT',
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
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }
    if (req.user.role !== 'ADMIN') {
      next(new ForbiddenError('Admin access required'));
      return;
    }
    const levels: Record<string, number> = { SUPPORT: 0, MODERATEUR: 1, SUPER_ADMIN: 2 };
    const access = (req.user.adminAccessLevel as string) ?? 'SUPPORT';
    if ((levels[access] ?? 0) < (levels[minimumLevel] ?? 0)) {
      next(new ForbiddenError('Insufficient admin access level'));
      return;
    }
    next();
  },
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

const CSV_HEADER =
  'identifiant,titre,artisan,categorie,technique,anneeCreation,prixXOF,statut,disponibilite,estMiseEnAvant,createdAt';

describe('Marketplace admin search, export CSV & pagination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExportCsv.mockResolvedValue(`${CSV_HEADER}\noeuvre-1,Test,Artisan,Cat,Main,2023,50000,BROUILLON,DISPONIBLE,false,2024-01-01T00:00:00.000Z`);
    mockAllAdmin.mockResolvedValue({ oeuvres: [{ id: 'oeuvre-1', titre: 'Test' }], total: 1 });
    mockGetAdmin.mockResolvedValue({ id: 'oeuvre-1', statut: 'BROUILLON' });
  });

  describe('GET /api/v1/admin/oeuvres/export', () => {
    it('returns 401 without a bearer token', async () => {
      const res = await request(app).get('/api/v1/admin/oeuvres/export');
      expect(res.status).toBe(401);
      expect(mockExportCsv).not.toHaveBeenCalled();
    });

    it('returns 403 for a non-admin role', async () => {
      const res = await request(app)
        .get('/api/v1/admin/oeuvres/export')
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'ARTISAN');
      expect(res.status).toBe(403);
      expect(mockExportCsv).not.toHaveBeenCalled();
    });

    it('allows an admin with SUPPORT access level (minimum)', async () => {
      const res = await request(app)
        .get('/api/v1/admin/oeuvres/export')
        .set('Authorization', 'Bearer token')
        .set('x-test-access-level', 'SUPPORT');

      expect(res.status).toBe(200);
      expect(mockExportCsv).toHaveBeenCalled();
    });

    it('exports a CSV with the expected headers, content type and disposition', async () => {
      const res = await request(app)
        .get('/api/v1/admin/oeuvres/export')
        .set('Authorization', 'Bearer token')
        .set('x-test-access-level', 'SUPPORT');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="oeuvres-/);
      expect(res.text).toBe(mockExportCsv.mock.results[0].value);
      expect(res.text).toContain('identifiant,titre,artisan,categorie,technique');
    });

    it('forwards the admin list filters to the export service', async () => {
      await request(app)
        .get('/api/v1/admin/oeuvres/export')
        .set('Authorization', 'Bearer token')
        .query({
          statut: 'PUBLIEE',
          artisanId: '123e4567-e89b-12d3-a456-426614174200',
          categorieId: '123e4567-e89b-12d3-a456-426614174201',
          disponibilite: 'SUR_COMMANDE',
          q: 'sculpture',
        });

      expect(mockExportCsv).toHaveBeenCalledWith(
        {
          statut: 'PUBLIEE',
          artisanId: '123e4567-e89b-12d3-a456-426614174200',
          categorieId: '123e4567-e89b-12d3-a456-426614174201',
          disponibilite: 'SUR_COMMANDE',
          q: 'sculpture',
        },
        expect.anything()
      );
    });

    it('is routed before :id so export is not treated as an id', async () => {
      const res = await request(app)
        .get('/api/v1/admin/oeuvres/export')
        .set('Authorization', 'Bearer token')
        .set('x-test-access-level', 'SUPPORT');

      expect(res.status).toBe(200);
      expect(mockGetAdmin).not.toHaveBeenCalled();
    });
  });

  describe('GET /api/v1/admin/oeuvres search & pagination', () => {
    it('forwards the q search parameter and existing filters to the service', async () => {
      const res = await request(app)
        .get('/api/v1/admin/oeuvres')
        .set('Authorization', 'Bearer token')
        .query({ q: 'sculpture', statut: 'PUBLIEE' });

      expect(res.status).toBe(200);
      expect(mockAllAdmin).toHaveBeenCalledWith(
        1,
        20,
        expect.objectContaining({ q: 'sculpture', statut: 'PUBLIEE' }),
        expect.anything()
      );
    });

    it('returns items, oeuvres, total, page, limit and totalPages', async () => {
      mockAllAdmin.mockResolvedValue({ oeuvres: [{ id: 'oeuvre-1' }], total: 1 });
      const res = await request(app)
        .get('/api/v1/admin/oeuvres')
        .set('Authorization', 'Bearer token')
        .query({ page: 2, limit: 10 });

      expect(res.status).toBe(200);
      expect(res.body.items).toEqual([{ id: 'oeuvre-1' }]);
      expect(res.body.oeuvres).toEqual([{ id: 'oeuvre-1' }]);
      expect(res.body.total).toBe(1);
      expect(res.body.page).toBe(2);
      expect(res.body.limit).toBe(10);
      expect(res.body.totalPages).toBe(1);
    });

    it('computes totalPages as 0 when total is 0', async () => {
      mockAllAdmin.mockResolvedValue({ oeuvres: [], total: 0 });
      const res = await request(app)
        .get('/api/v1/admin/oeuvres')
        .set('Authorization', 'Bearer token');

      expect(res.body.total).toBe(0);
      expect(res.body.totalPages).toBe(0);
      expect(res.body.items).toEqual([]);
    });

    it('computes totalPages across multiple pages', async () => {
      mockAllAdmin.mockResolvedValue({ oeuvres: [], total: 45 });
      const res = await request(app)
        .get('/api/v1/admin/oeuvres')
        .set('Authorization', 'Bearer token')
        .query({ limit: 20 });

      expect(res.body.total).toBe(45);
      expect(res.body.limit).toBe(20);
      expect(res.body.totalPages).toBe(3);
    });
  });
});
