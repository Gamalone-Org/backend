import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { ConflictError, ForbiddenError } from '../../src/common/errors/AppError.js';

const mockUploadMedia = vi.fn();
const mockDeleteMedia = vi.fn();
const mockReorderMedias = vi.fn();
const mockSetPhotoAtelier = vi.fn();
const mockDeletePhotoAtelier = vi.fn();

vi.mock('../../src/modules/marketplace/oeuvre.schema.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/modules/marketplace/oeuvre.schema.js')>();
  return {
    ...actual,
    mediaTypeQuerySchema: { parse: () => 'OEUVRE' as const },
  };
});

vi.mock('../../src/modules/marketplace/oeuvre.service.js', () => ({
  OeuvreService: class {
    createOeuvre = vi.fn();
    getMyOeuvres = vi.fn();
    getMyOeuvre = vi.fn();
    updateOeuvre = vi.fn();
    deleteOeuvre = vi.fn();
    publishOeuvre = vi.fn();
    withdrawOeuvreAdmin = vi.fn();
    getAllAdmin = vi.fn();
    getOeuvreAdmin = vi.fn();
    getPublishedPublic = vi.fn();
    getFeatured = vi.fn();
    getOeuvrePublic = vi.fn();
    getOeuvresByArtisanPublic = vi.fn();
  },
}));

vi.mock('../../src/modules/marketplace/media.service.js', () => ({
  MediaService: class {
    uploadMedia = mockUploadMedia;
    deleteMedia = mockDeleteMedia;
    reorderMedias = mockReorderMedias;
    setPhotoAtelier = mockSetPhotoAtelier;
    deletePhotoAtelier = mockDeletePhotoAtelier;
  },
}));

vi.mock('../../src/modules/auth/middleware/auth.middleware.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: '11111111-1111-1111-1111-111111111111', role: 'ADMIN' };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  requireAdminLevel: () => (_req: any, _res: any, next: any) => next(),
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

const OEUVRE_ID = '123e4567-e89b-12d3-a456-426614174200';
const MEDIA_ID = '123e4567-e89b-12d3-a456-426614174201';
const ARTISAN_ID = '123e4567-e89b-12d3-a456-426614174202';

describe('Marketplace media routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUploadMedia.mockResolvedValue({ id: MEDIA_ID, url: 'https://cloudinary.test/x.jpg' });
    mockReorderMedias.mockResolvedValue([]);
  });

  it('POST /api/v1/admin/oeuvres/:id/medias uploads an image', async () => {
    const response = await request(app)
      .post(`/api/v1/admin/oeuvres/${OEUVRE_ID}/medias`)
      .attach('file', Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(32)]), {
        filename: 'image.jpg',
        contentType: 'image/jpeg',
      });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('success', true);
    expect(mockUploadMedia).toHaveBeenCalled();
  });

  it('POST /medias rejects a non-image upload with 400', async () => {
    const response = await request(app)
      .post(`/api/v1/admin/oeuvres/${OEUVRE_ID}/medias`)
      .attach('file', Buffer.from('plain text not an image'), {
        filename: 'fake.txt',
        contentType: 'text/plain',
      });

    expect(response.status).toBe(400);
    expect(mockUploadMedia).not.toHaveBeenCalled();
  });

  it('POST /medias returns 409 for maximum images reached', async () => {
    mockUploadMedia.mockRejectedValueOnce(new ConflictError('Au moins une image est requise'));
    const response = await request(app)
      .post(`/api/v1/admin/oeuvres/${OEUVRE_ID}/medias`)
      .attach('file', Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(32)]), {
        filename: 'image.jpg',
        contentType: 'image/jpeg',
      });

    expect(response.status).toBe(409);
  });

  it('DELETE /api/v1/admin/oeuvres/:oeuvreId/medias/:mediaId returns 204', async () => {
    mockDeleteMedia.mockResolvedValue({ id: MEDIA_ID });
    const response = await request(app).delete(
      `/api/v1/admin/oeuvres/${OEUVRE_ID}/medias/${MEDIA_ID}`
    );

    expect(response.status).toBe(204);
    expect(mockDeleteMedia).toHaveBeenCalledWith(OEUVRE_ID, MEDIA_ID);
  });

  it('DELETE /medias returns 403 on ForbiddenError', async () => {
    mockDeleteMedia.mockRejectedValueOnce(new ForbiddenError('non autorisé'));
    const response = await request(app).delete(
      `/api/v1/admin/oeuvres/${OEUVRE_ID}/medias/${MEDIA_ID}`
    );

    expect(response.status).toBe(403);
  });

  it('PATCH /api/v1/admin/oeuvres/:oeuvreId/medias/reorder reorders medias', async () => {
    const response = await request(app)
      .patch(`/api/v1/admin/oeuvres/${OEUVRE_ID}/medias/reorder`)
      .send({ mediaIds: [MEDIA_ID] });

    expect(response.status).toBe(200);
    expect(mockReorderMedias).toHaveBeenCalledWith(OEUVRE_ID, [MEDIA_ID]);
  });

  it('PATCH /medias/reorder rejects an empty list', async () => {
    const response = await request(app)
      .patch(`/api/v1/admin/oeuvres/${OEUVRE_ID}/medias/reorder`)
      .send({ mediaIds: [] });

    expect(response.status).toBe(400);
  });

  it('POST /api/v1/admin/oeuvres/artisans/:artisanId/photo-atelier uploads', async () => {
    mockSetPhotoAtelier.mockResolvedValue({
      artisanProfileId: ARTISAN_ID,
      photoAtelierUrl: 'https://cloudinary.test/atelier.jpg',
      photoAtelierMimeType: 'image/jpeg',
      photoAtelierSize: 1000,
    });
    const response = await request(app)
      .post(`/api/v1/admin/oeuvres/artisans/${ARTISAN_ID}/photo-atelier`)
      .attach('file', Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(32)]), {
        filename: 'atelier.jpg',
        contentType: 'image/jpeg',
      });

    expect(response.status).toBe(200);
    expect(mockSetPhotoAtelier).toHaveBeenCalled();
  });

  it('DELETE /api/v1/admin/oeuvres/artisans/:artisanId/photo-atelier returns 204', async () => {
    mockDeletePhotoAtelier.mockResolvedValue({});
    const response = await request(app).delete(
      `/api/v1/admin/oeuvres/artisans/${ARTISAN_ID}/photo-atelier`
    );

    expect(response.status).toBe(204);
    expect(mockDeletePhotoAtelier).toHaveBeenCalledWith(ARTISAN_ID);
  });
});
