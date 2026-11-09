import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://user:password@localhost:5432/gamalone_test';
  process.env.PAYDUNYA_MASTER_KEY = 'test_master_key';
  process.env.PAYDUNYA_PRIVATE_KEY = 'test_private_key';
  process.env.PAYDUNYA_TOKEN = 'test_token';
  process.env.PAYDUNYA_MODE = 'test';
});

import request from 'supertest';
import { AppError } from '../../src/common/errors/AppError.js';

const mockHandlePayDunyaIpn = vi.fn();
const mockInitializeOrderPayment = vi.fn();

vi.mock('../../src/modules/payments/payment.service.js', () => ({
  PaymentService: class {
    handlePayDunyaIpn = mockHandlePayDunyaIpn;
    initializeOrderPayment = mockInitializeOrderPayment;
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

const app = (await import('../../src/app.js')).default;

describe('POST /api/v1/paiements/webhooks/paydunya (Integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHandlePayDunyaIpn.mockResolvedValue({ statut: 'TRAITE' });
  });

  it('is public and forwards the raw body and the signature header', async () => {
    const hash = 'f377cfb4ab47d108e9229e6b92c2e8ecaf163ea026bd829106e96944f93e2fc38855f06504364a7efaab652fd2edcd949dc23f16f65d72ced1dcc56858d26651';

    const res = await request(app)
      .post('/api/v1/paiements/webhooks/paydunya')
      .send({ data: { token: '987', hash } });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, statut: 'TRAITE' });
    expect(mockHandlePayDunyaIpn).toHaveBeenCalledWith({
      token: '987',
      status: undefined,
      payload: { data: { token: '987', hash } },
    });
  });

  it('does not require authentication (no 401 without a token)', async () => {
    const hash = 'f377cfb4ab47d108e9229e6b92c2e8ecaf163ea026bd829106e96944f93e2fc38855f06504364a7efaab652fd2edcd949dc23f16f65d72ced1dcc56858d26651';

    const res = await request(app)
      .post('/api/v1/paiements/webhooks/paydunya')
      .send({ data: { token: '1', hash } });

    expect(res.status).not.toBe(401);
    expect(mockHandlePayDunyaIpn).toHaveBeenCalled();
  });

  it('rejects a request without any body (400)', async () => {
    const res = await request(app).post('/api/v1/paiements/webhooks/paydunya');

    expect(res.status).toBe(400);
    expect(mockHandlePayDunyaIpn).not.toHaveBeenCalled();
  });

  it('propagates an invalid signature error (400)', async () => {
    mockHandlePayDunyaIpn.mockRejectedValue(
      new AppError(400, 'Signature de webhook PayDunya invalide.', 'PAYDUNYA_INVALID_SIGNATURE')
    );

    const res = await request(app)
      .post('/api/v1/paiements/webhooks/paydunya')
      .set('Content-Type', 'application/x-www-form-urlencoded')
      .send('data[name]=transaction.approved&data[entity][id]=1&data[hash]=invalid');

    expect(res.status).toBe(400);
  });
});
