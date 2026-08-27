import { describe, expect, it, vi } from 'vitest';

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
const vercelHandler = (await import('../../src/vercel.js')).default;

describe('Vercel serverless bootstrap', () => {
  it('exports the Express app without starting a TCP listener', () => {
    expect(app).toBeDefined();
    expect(vercelHandler).toBe(app);
  });
});
