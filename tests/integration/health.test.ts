import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';

vi.mock('../../src/modules/kyc/kyc.factory.js', () => ({
  createKycModule: () => ({
    controller: {
      submit: vi.fn(), resubmit: vi.fn(), getMine: vi.fn(), getById: vi.fn(),
      uploadDocument: vi.fn(), getDocuments: vi.fn(), deleteDocument: vi.fn(),
      listPendingReviews: vi.fn(), runPurge: vi.fn(), getReviewHistory: vi.fn(),
      getAdminDetailsById: vi.fn(), approve: vi.fn(), reject: vi.fn(),
      requestCorrection: vi.fn(), setLegalHold: vi.fn(), anonymize: vi.fn(),
    },
  }),
}));

const app = (await import('../../src/app.js')).default;

describe('Health Check', () => {
  it('GET /api/v1/health should return 200 with success true', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      message: 'GAMALONE API is running',
    });
  });

  it('should have correct content type', async () => {
    const response = await request(app).get('/api/v1/health');

    expect(response.type).toBe('application/json');
  });
});
