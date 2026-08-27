import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import {
  ConflictError,
  ForbiddenError,
  LoginRateLimitedError,
  PhoneNotVerifiedError,
  UnauthorizedError,
} from '../../src/common/errors/AppError.js';

const mockRegister = vi.fn(async () => ({
  message: 'Account created. A verification code has been sent by SMS.',
  expiresAt: new Date(Date.now() + 300000),
}));
const mockLogin = vi.fn(async () => ({
  accessToken: 'mocked.jwt.token',
  tokenType: 'Bearer',
  user: {
    id: '11111111-1111-1111-1111-111111111111',
    telephone: '+22890123456',
    role: 'ACHETEUR',
    statut: 'ACTIF',
    telephoneVerificationStatus: 'VERIFIE',
  },
}));
const mockVerifyPhone = vi.fn(async () => ({
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

vi.mock('../../src/modules/auth/services/AuthService.js', () => ({
  AuthService: class {
    requestOtp = vi.fn();
    resendOtp = vi.fn();
    verifyOtp = vi.fn();
    register = mockRegister;
    login = mockLogin;
    verifyPhone = mockVerifyPhone;
  },
}));

vi.mock('../../src/modules/auth/middleware/auth.middleware.js', () => ({
  requireAuth: (_req: any, _res: any, next: any) => next(),
  requireRole: () => (_req: any, _res: any, next: any) => next(),
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

describe('Auth register/login/verify-phone routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRegister.mockResolvedValue({
      message: 'Account created. A verification code has been sent by SMS.',
      expiresAt: new Date(Date.now() + 300000),
    });
    mockLogin.mockResolvedValue({
      accessToken: 'mocked.jwt.token',
      tokenType: 'Bearer',
      user: {
        id: '11111111-1111-1111-1111-111111111111',
        telephone: '+22890123456',
        role: 'ACHETEUR',
        statut: 'ACTIF',
        telephoneVerificationStatus: 'VERIFIE',
      },
    });
    mockVerifyPhone.mockResolvedValue({
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
  });

  it('POST /api/v1/auth/register returns 201 and no token', async () => {
    const response = await request(app).post('/api/v1/auth/register').send({
      role: 'ACHETEUR',
      nom: 'Awa Mensah',
      telephone: '+22890123456',
      motDePasse: 'S3cretPassword!',
    });

    expect(response.status).toBe(201);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('message');
    expect(response.body).toHaveProperty('expiresAt');
    expect(response.body).not.toHaveProperty('accessToken');
    expect(response.body).not.toHaveProperty('otp');
    expect(mockRegister).toHaveBeenCalledTimes(1);
    expect(mockRegister).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'ACHETEUR', nom: 'Awa Mensah' }),
      expect.any(String)
    );
  });

  it('POST /api/v1/auth/register accepts an ARTISAN with specialite and localisation', async () => {
    const response = await request(app).post('/api/v1/auth/register').send({
      role: 'ARTISAN',
      nom: 'Atelier Kokou',
      telephone: '+22890123456',
      specialite: 'Sculpture',
      localisation: 'Lomé, Togo',
      motDePasse: 'S3cretPassword!',
    });

    expect(response.status).toBe(201);
    expect(mockRegister).toHaveBeenCalledWith(
      expect.objectContaining({ role: 'ARTISAN', specialite: 'Sculpture' }),
      expect.any(String)
    );
  });

  it('POST /api/v1/auth/register rejects role ADMIN with 400', async () => {
    const response = await request(app).post('/api/v1/auth/register').send({
      role: 'ADMIN',
      nom: 'Admin User',
      telephone: '+22890123456',
      motDePasse: 'S3cretPassword!',
    });

    expect(response.status).toBe(400);
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('POST /api/v1/auth/register with a missing password returns 400', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .send({ role: 'ACHETEUR', nom: 'Awa Mensah', telephone: '+22890123456' });

    expect(response.status).toBe(400);
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('POST /api/v1/auth/register with an invalid email returns 400', async () => {
    const response = await request(app).post('/api/v1/auth/register').send({
      role: 'ACHETEUR',
      nom: 'Awa Mensah',
      telephone: '+22890123456',
      email: 'not-an-email',
      motDePasse: 'S3cretPassword!',
    });

    expect(response.status).toBe(400);
    expect(mockRegister).not.toHaveBeenCalled();
  });

  it('POST /api/v1/auth/register with a short password returns 400', async () => {
    const response = await request(app).post('/api/v1/auth/register').send({
      role: 'ACHETEUR',
      nom: 'Awa Mensah',
      telephone: '+22890123456',
      motDePasse: 'short',
    });

    expect(response.status).toBe(400);
  });

  it('POST /api/v1/auth/register maps duplicate accounts to 409', async () => {
    mockRegister.mockRejectedValueOnce(
      new ConflictError('An account with this phone number already exists')
    );

    const response = await request(app).post('/api/v1/auth/register').send({
      role: 'ACHETEUR',
      nom: 'Awa Mensah',
      telephone: '+22890123456',
      motDePasse: 'S3cretPassword!',
    });

    expect(response.status).toBe(409);
  });

  it('POST /api/v1/auth/login returns 200 with a token', async () => {
    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ telephone: '+22890123456', motDePasse: 'S3cretPassword!' });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('success', true);
    expect(response.body).toHaveProperty('accessToken', 'mocked.jwt.token');
    expect(response.body).toHaveProperty('tokenType', 'Bearer');
    expect(response.body.user).not.toHaveProperty('motDePasse');
  });

  it('POST /api/v1/auth/login with invalid credentials returns 401', async () => {
    mockLogin.mockRejectedValueOnce(new UnauthorizedError('Invalid credentials'));

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ telephone: '+22890123456', motDePasse: 'wrong-password' });

    expect(response.status).toBe(401);
  });

  it('POST /api/v1/auth/login for a suspended account returns 403', async () => {
    mockLogin.mockRejectedValueOnce(new ForbiddenError('Account is not active'));

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ telephone: '+22890123456', motDePasse: 'S3cretPassword!' });

    expect(response.status).toBe(403);
  });

  it('POST /api/v1/auth/login with a mismatched space returns 403', async () => {
    mockLogin.mockRejectedValueOnce(
      new ForbiddenError(
        'This phone number belongs to a ACHETEUR account. Please use the ACHETEUR space instead.'
      )
    );

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ telephone: '+22890123456', motDePasse: 'S3cretPassword!', role: 'ARTISAN' });

    expect(response.status).toBe(403);
  });

  it('POST /api/v1/auth/login for an unverified phone returns 403 with PHONE_NOT_VERIFIED', async () => {
    mockLogin.mockRejectedValueOnce(
      new PhoneNotVerifiedError('Your phone number is not verified yet.')
    );

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ telephone: '+22890123456', motDePasse: 'S3cretPassword!' });

    expect(response.status).toBe(403);
    expect(response.body).toHaveProperty('code', 'PHONE_NOT_VERIFIED');
  });

  it('POST /api/v1/auth/login when rate limited returns 429', async () => {
    mockLogin.mockRejectedValueOnce(new LoginRateLimitedError());

    const response = await request(app)
      .post('/api/v1/auth/login')
      .send({ telephone: '+22890123456', motDePasse: 'S3cretPassword!' });

    expect(response.status).toBe(429);
  });

  it('POST /api/v1/auth/login with an empty body returns 400', async () => {
    const response = await request(app).post('/api/v1/auth/login').send({});

    expect(response.status).toBe(400);
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it('POST /api/v1/auth/verify-phone returns 200 with a token', async () => {
    const response = await request(app)
      .post('/api/v1/auth/verify-phone')
      .send({ telephone: '+22890123456', code: '123456' });

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty('accessToken', 'mocked.jwt.token');
    expect(mockVerifyPhone).toHaveBeenCalledWith('+22890123456', '123456');
  });

  it('POST /api/v1/auth/verify-phone with no matching account returns 401', async () => {
    mockVerifyPhone.mockRejectedValueOnce(
      new UnauthorizedError('No account found for this phone number. Please register first.')
    );

    const response = await request(app)
      .post('/api/v1/auth/verify-phone')
      .send({ telephone: '+22890123456', code: '123456' });

    expect(response.status).toBe(401);
  });

  it('POST /api/v1/auth/verify-phone with a missing code returns 400', async () => {
    const response = await request(app)
      .post('/api/v1/auth/verify-phone')
      .send({ telephone: '+22890123456' });

    expect(response.status).toBe(400);
    expect(mockVerifyPhone).not.toHaveBeenCalled();
  });
});
