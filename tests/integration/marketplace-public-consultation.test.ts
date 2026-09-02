import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { NotFoundError } from '../../src/common/errors/AppError.js';

const mockListPublic = vi.fn();
const mockGetFeatured = vi.fn();
const mockGetPublic = vi.fn();
const mockGetByArtisan = vi.fn();

vi.mock('../../src/modules/marketplace/oeuvre.service.js', () => ({
  OeuvreService: class {
    createOeuvre = vi.fn();
    getMyOeuvres = vi.fn();
    getMyOeuvre = vi.fn();
    updateOeuvre = vi.fn();
    deleteOeuvre = vi.fn();
    submitForValidation = vi.fn();
    withdrawOeuvre = vi.fn();
    getPendingValidation = vi.fn();
    getAllAdmin = vi.fn();
    getOeuvreAdmin = vi.fn();
    approveOeuvre = vi.fn();
    rejectOeuvre = vi.fn();
    withdrawOeuvreAdmin = vi.fn();
    getPublishedPublic = mockListPublic;
    getFeatured = mockGetFeatured;
    getOeuvrePublic = mockGetPublic;
    getOeuvresByArtisanPublic = mockGetByArtisan;
  },
}));

vi.mock('../../src/modules/marketplace/media.service.js', () => ({
  MediaService: class {
    uploadMedia = vi.fn();
    deleteMedia = vi.fn();
    reorderMedias = vi.fn();
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

const app = (await import('../../src/app.js')).default;

const OEUVRE_ID = '123e4567-e89b-12d3-a456-426614174300';
const ARTISAN_ID = '123e4567-e89b-12d3-a456-426614174301';

const publicOeuvre = {
  id: OEUVRE_ID,
  titre: 'Sculpture',
  statut: 'PUBLIEE',
  prixXOF: 50000,
  estMiseEnAvant: false,
  artisan: { id: ARTISAN_ID, type: 'ARTISAN', nomAtelier: 'Atelier' },
  categorie: { id: 'cat-1', nom: 'Sculpture' },
  medias: [],
};

describe('Marketplace public consultation routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListPublic.mockResolvedValue({ oeuvres: [publicOeuvre], total: 1, page: 1, limit: 20 });
    mockGetFeatured.mockResolvedValue([publicOeuvre]);
    mockGetPublic.mockResolvedValue(publicOeuvre);
    mockGetByArtisan.mockResolvedValue({ oeuvres: [publicOeuvre], total: 1 });
  });

  it('GET /api/v1/oeuvres lists published oeuvres', async () => {
    const response = await request(app).get('/api/v1/oeuvres?page=1&limit=20');

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('oeuvres');
    expect(mockListPublic).toHaveBeenCalled();
  });

  it('GET /api/v1/oeuvres rejects a limit over 50', async () => {
    const response = await request(app).get('/api/v1/oeuvres?limit=100');
    expect(response.status).toBe(400);
  });

  it('GET /api/v1/oeuvres rejects an invalid artisanType filter', async () => {
    const response = await request(app).get('/api/v1/oeuvres?artisanType=INVALID');
    expect(response.status).toBe(400);
    expect(mockListPublic).not.toHaveBeenCalled();
  });

  it('GET /api/v1/oeuvres/featured returns featured oeuvres', async () => {
    const response = await request(app).get('/api/v1/oeuvres/featured?limit=5');
    expect(response.status).toBe(200);
    expect(response.body.oeuvres).toHaveLength(1);
    expect(mockGetFeatured).toHaveBeenCalledWith(5, expect.anything());
  });

  it('GET /api/v1/oeuvres/:id returns a single published oeuvre', async () => {
    const response = await request(app).get(`/api/v1/oeuvres/${OEUVRE_ID}`);
    expect(response.status).toBe(200);
    expect(response.body.oeuvre).toHaveProperty('artisan');
    expect(mockGetPublic).toHaveBeenCalledWith(OEUVRE_ID, expect.anything());
  });

  it('GET /api/v1/oeuvres/:id hides unpublished oeuvres (404)', async () => {
    mockGetPublic.mockRejectedValueOnce(new NotFoundError('Œuvre non trouvée'));
    const response = await request(app).get(`/api/v1/oeuvres/${OEUVRE_ID}`);
    expect(response.status).toBe(404);
  });

  it('GET /api/v1/oeuvres/:id rejects an invalid id', async () => {
    const response = await request(app).get('/api/v1/oeuvres/not-a-uuid');
    expect(response.status).toBe(400);
  });

  it('GET /api/v1/artisans/:artisanId/oeuvres lists an artisan published oeuvres', async () => {
    const response = await request(app).get(
      `/api/v1/artisans/${ARTISAN_ID}/oeuvres?page=1&limit=10`
    );
    expect(response.status).toBe(200);
    expect(mockGetByArtisan).toHaveBeenCalled();
  });
});
