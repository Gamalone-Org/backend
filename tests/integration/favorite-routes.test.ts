import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import {
  ForbiddenError,
  UnauthorizedError,
  NotFoundError,
} from '../../src/common/errors/AppError.js';

const mockList = vi.fn();
const mockAdd = vi.fn();
const mockRemove = vi.fn();

vi.mock('../../src/modules/favorites/favorites.service.js', () => ({
  FavoriteService: class {
    getMyFavorites = mockList;
    addFavorite = mockAdd;
    removeFavorite = mockRemove;
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
      id: req.headers['x-test-user-id'] ?? 'acheteur-1',
      role: req.headers['x-test-role'] ?? 'ACHETEUR',
      telephone: '+22890123456',
      statut: 'ACTIF',
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
  requireAdminLevel: () => (_req: any, _res: any, next: any) => next(),
  requirePermission: (...permissions: string[]) => (_req: any, _res: any, next: any) => next(),
}));

const app = (await import('../../src/app.js')).default;

const OEUVRE_ID = '123e4567-e89b-12d3-a456-426614174100';
const AUTH = { Authorization: 'Bearer test-token' };

const favoriBody = {
  id: '123e4567-e89b-12d3-a456-426614174900',
  dateCreation: '2026-09-12T08:00:00.000Z',
  oeuvre: {
    id: OEUVRE_ID,
    titre: 'Sculpture en bois',
    prixXOF: 25000,
    statut: 'PUBLIEE',
    disponibilite: 'DISPONIBLE',
    artisan: {
      id: '123e4567-e89b-12d3-a456-426614174111',
      nomAtelier: 'Atelier Awa',
      user: { nom: 'Awa' },
    },
    medias: [{ id: 'media-1', url: 'https://cdn.gamalone/oeuvre-1.jpg' }],
  },
};

describe('Favorites routes (Integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue({
      favoris: [favoriBody],
      total: 1,
      page: 1,
      limit: 20,
    });
    mockAdd.mockResolvedValue(favoriBody);
    mockRemove.mockResolvedValue(undefined);
  });

  it('F16 - GET /api/v1/favoris without token returns 401', async () => {
    const res = await request(app).get('/api/v1/favoris');
    expect(res.status).toBe(401);
  });

  it('F17 - GET /api/v1/favoris with ARTISAN returns 403', async () => {
    const res = await request(app)
      .get('/api/v1/favoris')
      .set('Authorization', 'Bearer test-token')
      .set('x-test-role', 'ARTISAN');
    expect(res.status).toBe(403);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('F18 - GET /api/v1/favoris with ADMIN returns 403', async () => {
    const res = await request(app)
      .get('/api/v1/favoris')
      .set('Authorization', 'Bearer test-token')
      .set('x-test-role', 'ADMIN');
    expect(res.status).toBe(403);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('F19 - GET /api/v1/favoris with ACHETEUR returns 200 and the list', async () => {
    const res = await request(app).get('/api/v1/favoris').set(AUTH);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.favoris).toHaveLength(1);
    expect(res.body.total).toBe(1);
    expect(mockList).toHaveBeenCalledWith('acheteur-1', 1, 20);
  });

  it('F26 - pagination is forwarded to the service and echoed in the response', async () => {
    mockList.mockResolvedValue({
      favoris: [],
      total: 5,
      page: 2,
      limit: 10,
    });

    const res = await request(app).get('/api/v1/favoris?page=2&limit=10').set(AUTH);

    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith('acheteur-1', 2, 10);
    expect(res.body.page).toBe(2);
    expect(res.body.limit).toBe(10);
    expect(res.body.total).toBe(5);
  });

  it('F27 - response exposes the artwork card structure (oeuvre, artisan, user.nom, cover media)', async () => {
    const res = await request(app).get('/api/v1/favoris').set(AUTH);

    const item = res.body.favoris[0];
    expect(item.id).toBe(favoriBody.id);
    expect(item.dateCreation).toBeDefined();
    expect(item.oeuvre.titre).toBe('Sculpture en bois');
    expect(item.oeuvre.prixXOF).toBe(25000);
    expect(item.oeuvre.statut).toBe('PUBLIEE');
    expect(item.oeuvre.artisan.id).toBeDefined();
    expect(item.oeuvre.artisan.nomAtelier).toBe('Atelier Awa');
    expect(item.oeuvre.artisan.user.nom).toBe('Awa');
    expect(item.oeuvre.medias[0].url).toBe('https://cdn.gamalone/oeuvre-1.jpg');
    expect(res.body.total).toBe(1);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(20);
  });

  it('F20 - POST /api/v1/favoris/:oeuvreId adds a favorite (201)', async () => {
    const res = await request(app).post(`/api/v1/favoris/${OEUVRE_ID}`).set(AUTH);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.message).toBeDefined();
    expect(res.body.favori.id).toBe(favoriBody.id);
    expect(mockAdd).toHaveBeenCalledWith('acheteur-1', OEUVRE_ID);
  });

  it('F21 - POST with an invalid oeuvreId returns 400 (Zod) and never calls the service', async () => {
    const res = await request(app).post('/api/v1/favoris/not-a-uuid').set(AUTH);

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('F22 - POST with a non-existent / inaccessible artwork returns 404', async () => {
    mockAdd.mockRejectedValue(new NotFoundError('Œuvre introuvable ou indisponible'));

    const res = await request(app).post(`/api/v1/favoris/${OEUVRE_ID}`).set(AUTH);

    expect(res.status).toBe(404);
  });

  it('F23 - POST duplicate returns 201 (idempotent, no 500)', async () => {
    mockAdd.mockResolvedValue(favoriBody);

    const res = await request(app).post(`/api/v1/favoris/${OEUVRE_ID}`).set(AUTH);

    expect(res.status).toBe(201);
    expect(res.body.favori.id).toBe(favoriBody.id);
  });

  it('ownership - the buyer id always comes from the token, a body acheteurId is ignored', async () => {
    await request(app)
      .post(`/api/v1/favoris/${OEUVRE_ID}`)
      .set({ ...AUTH, 'x-test-user-id': 'acheteur-A' })
      .send({ acheteurId: 'acheteur-EVIL', buyerProfileId: 'acheteur-EVIL' });

    expect(mockAdd).toHaveBeenCalledTimes(1);
    // La seule source d'identité est l'utilisateur authentifié (JWT).
    expect(mockAdd).toHaveBeenCalledWith('acheteur-A', OEUVRE_ID);
  });

  it('F24 - DELETE /api/v1/favoris/:oeuvreId removes the favorite (204)', async () => {
    const res = await request(app).delete(`/api/v1/favoris/${OEUVRE_ID}`).set(AUTH);

    expect(res.status).toBe(204);
    expect(mockRemove).toHaveBeenCalledWith('acheteur-1', OEUVRE_ID);
  });

  it('F24 - DELETE with an invalid oeuvreId returns 400', async () => {
    const res = await request(app).delete('/api/v1/favoris/not-a-uuid').set(AUTH);

    expect(res.status).toBe(400);
    expect(mockRemove).not.toHaveBeenCalled();
  });

  it('F24 - DELETE is idempotent: removing an absent favorite returns 204', async () => {
    mockRemove.mockResolvedValue(undefined);

    const res = await request(app).delete(`/api/v1/favoris/${OEUVRE_ID}`).set(AUTH);

    expect(res.status).toBe(204);
  });

  it('F25 - DELETE of another buyer is impossible: the deletion is scoped to the token user', async () => {
    // L'acheteur A a mis l'œuvre X en favori ; l'acheteur B tente de la retirer.
    // Le controller ne passe que l'id de l'utilisateur authentifié (B) : la
    // suppression réelle est scopée (acheteurId + oeuvreId) dans le repository
    // (test unitaire F8), le favori de A ne peut jamais être la cible.
    await request(app)
      .delete(`/api/v1/favoris/${OEUVRE_ID}`)
      .set({ ...AUTH, 'x-test-user-id': 'acheteur-B' });

    expect(mockRemove).toHaveBeenCalledTimes(1);
    expect(mockRemove).toHaveBeenCalledWith('acheteur-B', OEUVRE_ID);
    expect(mockRemove.mock.calls[0]).not.toContain('acheteur-A');
  });
});