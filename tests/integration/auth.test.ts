import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { InvalidOtpError, UnauthorizedError } from '../../src/common/errors/AppError.js';

const mockRequestOtp = vi.fn(async () => ({
  message: 'OTP sent successfully',
  expiresAt: new Date(Date.now() + 300000),
}));
const mockResendOtp = vi.fn(async () => ({
  message: 'OTP resent',
  expiresAt: new Date(Date.now() + 300000),
}));
const mockVerifyOtp = vi.fn(async () => ({
  accessToken: 'mocked.jwt.token',
  tokenType: 'Bearer',
  user: {
    id: '11111111-1111-1111-1111-111111111111',
    telephone: '+22890123456',
    role: 'ACHETEUR',
    statut: 'EN_ATTENTE_VALIDATION',
    telephoneVerificationStatus: 'VERIFIE',
  },
}));
const mockGetCurrentUser = vi.fn(async () => ({
  id: '11111111-1111-1111-1111-111111111111',
  telephone: '+22890123456',
  role: 'ACHETEUR',
  statut: 'ACTIF',
  telephoneVerificationStatus: 'VERIFIE',
}));

vi.mock('../../src/modules/auth/services/AuthService.js', () => ({
  AuthService: class {
    requestOtp = mockRequestOtp;
    resendOtp = mockResendOtp;
    verifyOtp = mockVerifyOtp;
    getCurrentUser = mockGetCurrentUser;
  },
}));

vi.mock('../../src/modules/auth/middleware/auth.middleware.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    const authorization = req.headers.authorization;

    if (!authorization || !authorization.startsWith('Bearer ')) {
      next(new UnauthorizedError('Missing or invalid bearer token'));
      return;
    }

    req.user = {
      id: '11111111-1111-1111-1111-111111111111',
      role: 'ACHETEUR',
      telephone: '+22890123456',
      statut: 'ACTIF',
    };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
}));

const app = (await import('../../src/app.js')).default;

describe('Auth routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequestOtp.mockResolvedValue({
      message: 'OTP sent successfully',
      expiresAt: new Date(Date.now() + 300000),
    });
    mockResendOtp.mockResolvedValue({
      message: 'OTP resent',
      expiresAt: new Date(Date.now() + 300000),
    });
    mockVerifyOtp.mockResolvedValue({
      accessToken: 'mocked.jwt.token',
      tokenType: 'Bearer',
      user: {
        id: '11111111-1111-1111-1111-111111111111',
        telephone: '+22890123456',
        role: 'ACHETEUR',
        statut: 'EN_ATTENTE_VALIDATION',
        telephoneVerificationStatus: 'VERIFIE',
      },
    });
    mockGetCurrentUser.mockResolvedValue({
      id: '11111111-1111-1111-1111-111111111111',
      telephone: '+22890123456',
      role: 'ACHETEUR',
      statut: 'ACTIF',
      telephoneVerificationStatus: 'VERIFIE',
    });
  });

  it('POST /api/v1/auth/otp/send with valid phone returns 200 and no OTP in body', async () => {
    const response = await request(app)
      .post('/api/v1/auth/otp/send')
      .send({ phone: '+22890123456' });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('message');
    expect(response.body).not.toHaveProperty('otp');
    expect(response.body).toHaveProperty('expiresAt');
  });

  it('POST /api/v1/auth/otp/resend with valid phone returns 200 and no OTP in body', async () => {
    const response = await request(app)
      .post('/api/v1/auth/otp/resend')
      .send({ phone: '+22890123456' });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('message', 'OTP resent');
    expect(response.body).not.toHaveProperty('otp');
    expect(response.body).toHaveProperty('expiresAt');
  });

  it('POST /api/v1/auth/otp/verify with invalid OTP returns 400', async () => {
    mockVerifyOtp.mockRejectedValueOnce(new InvalidOtpError('OTP code is incorrect'));

    const response = await request(app)
      .post('/api/v1/auth/otp/verify')
      .send({ phone: '+22890123456', code: '000000' });

    expect(response.status).toBe(400);
  });

  it('GET /api/v1/auth/me without token returns 401', async () => {
    const response = await request(app).get('/api/v1/auth/me');

    expect(response.status).toBe(401);
  });

  it('GET /api/v1/auth/me with malformed Authorization header returns 401', async () => {
    const response = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', 'Basic abc123');

    expect(response.status).toBe(401);
  });
});
