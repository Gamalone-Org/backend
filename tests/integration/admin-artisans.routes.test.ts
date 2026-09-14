import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import {
  ForbiddenError,
  UnauthorizedError,
} from '../../src/common/errors/AppError.js';

const mockListArtisans = vi.fn();
const mockGetArtisanDetail = vi.fn();
const mockListArtworks = vi.fn();
const mockListOrders = vi.fn();

vi.mock('../../src/modules/admin/artisans/admin-artisans.service.js', () => ({
  AdminArtisansService: class {
    listArtisans = mockListArtisans;
    getArtisanDetail = mockGetArtisanDetail;
    listArtworks = mockListArtworks;
    listOrders = mockListOrders;
  },
}));

vi.mock('../../src/shared/services/cloudinary/index.js', () => ({
  CloudinaryService: class {
    uploadDocument = vi.fn();
    deleteAsset = vi.fn();
    getMetadata = vi.fn();
    generateSignedUrl = vi.fn();
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
      adminAccessLevel: req.headers['x-test-admin-level'] ?? null,
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
  requireAdminLevel: (minimum: string) => (req: any, _res: any, next: any) => {
    if (!req.user || req.user.role !== 'ADMIN') {
      next(new ForbiddenError('Insufficient permissions'));
      return;
    }
    const level = req.user.adminAccessLevel;
    const rank: Record<string, number> = { SUPPORT: 0, MODERATEUR: 1, SUPER_ADMIN: 2 };
    if (!level || rank[level as string] === undefined || rank[level as string] < rank[minimum]) {
      next(new ForbiddenError('Insufficient permissions'));
      return;
    }
    next();
  },
  requirePermission: (...permissions: string[]) => (_req: any, _res: any, next: any) => next(),
}));

const app = (await import('../../src/app.js')).default;

describe('Admin Artisans routes (Integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListArtisans.mockResolvedValue({
      items: [
        {
          id: 'profile-1',
          userId: 'user-1',
          nom: 'Awa Diop',
          nomAtelier: 'Atelier Awa',
          avatar: null,
          specialty: 'Poterie',
          location: 'Dakar',
          inscription: '2025-01-01T00:00:00.000Z',
          accountStatus: 'ACTIF',
          kycStatus: 'VALIDE',
          kycId: 'kyc-abc',
          artworksCount: 3,
          grossOrderVolume: 150000,
        },
      ],
      total: 1,
      page: 1,
      limit: 20,
    });
    mockGetArtisanDetail.mockResolvedValue({
      profil: { userId: 'user-1', nom: 'Awa Diop', email: 'awa@test.com', telephone: '+221770000001', accountStatus: 'ACTIF', inscription: '2025-01-01T00:00:00.000Z' },
      artisan: { id: 'profile-1', type: 'ARTISAN', nomAtelier: 'Atelier Awa', specialite: 'Poterie', biographie: 'Bio', localisation: 'Dakar', anneesExperience: 5, estCertifie: false, scoreFiabilite: null, photoAtelierUrl: null, validatedAt: null, createdAt: new Date('2025-01-01') },
      kyc: { id: 'kyc-abc', status: 'VALIDE', submittedAt: new Date('2025-02-01'), reviewedAt: new Date('2025-02-05') },
      statistiques: { totalOeuvres: 5, publiees: 3, enPanier: 1, vendues: 1, nbCommandesArtisan: 12, grossOrderVolume: 480000 },
    });
    mockListArtworks.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
    mockListOrders.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
  });

  const authHeaders = (role = 'ADMIN', level = 'SUPPORT') => ({
    Authorization: 'Bearer fake-token',
    'x-test-role': role,
    'x-test-admin-level': level,
  });

  const ARTISAN_ID = '9a8b7c6d-5e4f-4a3b-9c2d-1e0f1a2b3c4d';

  it('exige une authentification (401) sur la liste', async () => {
    const res = await request(app).get('/api/v1/admin/artisans');
    expect(res.status).toBe(401);
  });

  it('refuse un acheteur (403)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/artisans')
      .set(authHeaders('ACHETEUR'));
    expect(res.status).toBe(403);
  });

  it('refuse un artisan (403)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/artisans')
      .set(authHeaders('ARTISAN'));
    expect(res.status).toBe(403);
  });

  it('liste les artisans pour un SUPPORT (200)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/artisans')
      .set(authHeaders());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.total).toBe(1);
    expect(mockListArtisans).toHaveBeenCalled();
  });

  it('passe les filtres kycStatus, kycPending, accountStatus et la recherche q au service', async () => {
    await request(app)
      .get('/api/v1/admin/artisans?q=Dakar&kycStatus=VALIDE&accountStatus=ACTIF')
      .set(authHeaders());

    const arg = mockListArtisans.mock.calls[0][1];
    expect(arg).toEqual({ page: 1, limit: 20, q: 'Dakar', kycStatus: 'VALIDE', accountStatus: 'ACTIF', kycPending: undefined });
  });

  it('passe kycPending=true au service', async () => {
    await request(app)
      .get('/api/v1/admin/artisans?kycPending=true')
      .set(authHeaders());

    const arg = mockListArtisans.mock.calls[0][1];
    expect(arg.kycPending).toBe(true);
  });

  it('renvoie 400 quand kycStatus et kycPending sont fournis ensemble', async () => {
    const res = await request(app)
      .get('/api/v1/admin/artisans?kycStatus=VALIDE&kycPending=true')
      .set(authHeaders());
    expect(res.status).toBe(400);
  });

  it('renvoie 400 pour un statut KYC invalide', async () => {
    const res = await request(app)
      .get('/api/v1/admin/artisans?kycStatus=INVALIDE')
      .set(authHeaders());
    expect(res.status).toBe(400);
  });

  it('renvoie 400 pour limit > 100', async () => {
    const res = await request(app)
      .get('/api/v1/admin/artisans?limit=101')
      .set(authHeaders());
    expect(res.status).toBe(400);
  });

  it('renvoie 400 pour un statut de compte invalide', async () => {
    const res = await request(app)
      .get('/api/v1/admin/artisans?accountStatus=INVALIDE')
      .set(authHeaders());
    expect(res.status).toBe(400);
  });

  it('exige une authentification (401) sur le dÃ©tail', async () => {
    const res = await request(app).get('/api/v1/admin/artisans/' + ARTISAN_ID);
    expect(res.status).toBe(401);
  });

  it('renvoie le dÃ©tail pour un SUPPORT (200)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/artisans/' + ARTISAN_ID)
      .set(authHeaders());
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.artisan.statistiques.grossOrderVolume).toBe(480000);
  });

  it('renvoie 400 pour un id non UUID', async () => {
    const res = await request(app)
      .get('/api/v1/admin/artisans/not-a-uuid')
      .set(authHeaders());
    expect(res.status).toBe(400);
  });

  it('renvoie 404 si l\'artisan dÃ©tail n\'existe pas', async () => {
    mockGetArtisanDetail.mockRejectedValue(new (await import('../../src/common/errors/AppError.js')).NotFoundError('Artisan non trouvÃ©'));
    const res = await request(app)
      .get('/api/v1/admin/artisans/9a8b7c6d-5e4f-4a3b-9c2d-1e0f1a2b3c4d')
      .set(authHeaders());
    expect(res.status).toBe(404);
  });

  it('exige une authentification (401) sur les Å“uvres', async () => {
    const res = await request(app).get('/api/v1/admin/artisans/' + ARTISAN_ID + '/artworks');
    expect(res.status).toBe(401);
  });

  it('liste les Å“uvres pour un SUPPORT avec le filtre statut', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/artisans/${ARTISAN_ID}/artworks?statut=PUBLIEE&page=2&limit=5`)
      .set(authHeaders());
    expect(res.status).toBe(200);
    expect(mockListArtworks).toHaveBeenCalledWith(expect.anything(), ARTISAN_ID, { page: 2, limit: 5, statut: 'PUBLIEE' });
  });

  it('renvoie 400 pour un statut Å“uvre invalide', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/artisans/${ARTISAN_ID}/artworks?statut=INVALIDE`)
      .set(authHeaders());
    expect(res.status).toBe(400);
  });

  it('exige une authentification (401) sur les commandes', async () => {
    const res = await request(app).get('/api/v1/admin/artisans/' + ARTISAN_ID + '/orders');
    expect(res.status).toBe(401);
  });

  it('liste les commandes pour un SUPPORT avec le filtre statut', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/artisans/${ARTISAN_ID}/orders?statut=LIVREE`)
      .set(authHeaders());
    expect(res.status).toBe(200);
    expect(mockListOrders).toHaveBeenCalledWith(expect.anything(), ARTISAN_ID, { page: 1, limit: 20, statut: 'LIVREE' });
  });

  it('renvoie 400 pour un statut commande invalide', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/artisans/${ARTISAN_ID}/orders?statut=INVALIDE`)
      .set(authHeaders());
    expect(res.status).toBe(400);
  });

  it('refuse un SUPER_ADMIN non admin au niveau suffisant â€” garde par rÃ´le', async () => {
    const res = await request(app)
      .get('/api/v1/admin/artisans')
      .set(authHeaders('ACHETEUR', 'SUPER_ADMIN'));
    expect(res.status).toBe(403);
  });
});
