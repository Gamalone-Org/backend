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

describe('GET /api/v1/geo', () => {
  it('uses the country header set by the reverse proxy', async () => {
    const response = await request(app).get('/api/v1/geo').set('CF-IPCountry', 'it');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ country: 'IT' });
    expect(response.headers['cache-control']).toBe('private, no-store');
  });

  it('ignores the unknown/Tor placeholders of Cloudflare', async () => {
    const response = await request(app)
      .get('/api/v1/geo')
      .set('CF-IPCountry', 'XX')
      .set('X-Forwarded-For', '41.207.160.1');

    expect(response.body).toEqual({ country: 'TG' });
  });

  it('looks the client IP up in the local GeoIP database', async () => {
    const response = await request(app).get('/api/v1/geo').set('X-Forwarded-For', '41.207.160.1');

    expect(response.body).toEqual({ country: 'TG' });
  });

  it('returns null when the IP cannot be located', async () => {
    const response = await request(app).get('/api/v1/geo').set('X-Forwarded-For', '127.0.0.1');

    expect(response.body).toEqual({ country: null });
  });
});
