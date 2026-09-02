import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';

const mockCreate = vi.fn();

vi.mock('../../src/modules/marketplace/oeuvre.service.js', () => ({
  OeuvreService: class {
    createOeuvre = mockCreate;
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

// NOTE: auth.middleware.js is NOT mocked here on purpose, so the REAL
// requireAuth / requireRole / requireAdminLevel guard the routes.

const app = (await import('../../src/app.js')).default;

describe('Marketplace route-level RBAC', () => {
  it('rejects an unauthenticated artisan create with 401', async () => {
    const response = await request(app).post('/api/v1/artisan/oeuvres').send({});
    expect(response.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated artisan list with 401', async () => {
    const response = await request(app).get('/api/v1/artisan/oeuvres');
    expect(response.status).toBe(401);
  });

  it('rejects an unauthenticated media upload with 401', async () => {
    const response = await request(app).post(
      '/api/v1/artisan/oeuvres/123e4567-e89b-12d3-a456-426614174500/medias'
    );
    expect(response.status).toBe(401);
  });

  it('rejects an unauthenticated admin moderation route with 401', async () => {
    const response = await request(app).get('/api/v1/admin/oeuvres/pending');
    expect(response.status).toBe(401);
  });

  it('rejects an unauthenticated approve with 401', async () => {
    const response = await request(app).post(
      '/api/v1/admin/oeuvres/123e4567-e89b-12d3-a456-426614174500/approve'
    );
    expect(response.status).toBe(401);
  });

  it('allows public listing without authentication', async () => {
    const response = await request(app).get('/api/v1/oeuvres?page=1&limit=10');
    // public route mounted before auth guard => should not 401
    expect(response.status).not.toBe(401);
  });
});
