import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';

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

const app = (await import('../../src/app.js')).default;

describe('POST /api/v1/paiements/webhooks/fedapay — Legacy webhook returns 410 Gone', () => {
  it('returns 410 Gone without any business logic', async () => {
    const res = await request(app)
      .post('/api/v1/paiements/webhooks/fedapay')
      .send({ name: 'transaction.approved', entity: { id: 123 } });

    expect(res.status).toBe(410);
    expect(res.body).toEqual({
      success: false,
      message: 'Webhook FedaPay désactivé (statut 410 Gone).',
    });
  });

  it('does not require authentication', async () => {
    const res = await request(app)
      .post('/api/v1/paiements/webhooks/fedapay')
      .send({ test: 'data' });

    expect(res.status).toBe(410);
  });

  it('returns 410 for POST on the legacy endpoint', async () => {
    const res = await request(app)
      .post('/api/v1/paiements/webhooks/fedapay')
      .send({ test: 'data' });

    expect(res.status).toBe(410);
  });
});