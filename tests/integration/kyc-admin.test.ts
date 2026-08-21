import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { ForbiddenError, UnauthorizedError } from '../../src/common/errors/AppError.js';

const mockListPendingReviews = vi.fn();
const mockGetAdminDetailsById = vi.fn();
const mockGetReviewHistory = vi.fn();
const mockApproveKyc = vi.fn();
const mockRejectKyc = vi.fn();
const mockRequestKycCorrection = vi.fn();

vi.mock('../../src/modules/kyc/kyc.service.js', () => ({
  KycService: class {
    listPendingReviews = mockListPendingReviews;
    getAdminDetailsById = mockGetAdminDetailsById;
    getReviewHistory = mockGetReviewHistory;
    approveKyc = mockApproveKyc;
    rejectKyc = mockRejectKyc;
    requestKycCorrection = mockRequestKycCorrection;
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
      id: req.headers['x-test-user-id'] ?? 'admin-1',
      role: req.headers['x-test-role'] ?? 'ADMIN',
      telephone: '+22890123456',
      statut: 'ACTIF',
    };
    next();
  },
  requireRole: (...roles: string[]) => (req: any, _res: any, next: any) => {
    if (!req.user) {
      next(new UnauthorizedError('Authentication required'));
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(new ForbiddenError('Insufficient permissions'));
      return;
    }
    next();
  },
}));

const app = (await import('../../src/app.js')).default;
const testKycId = '11111111-1111-4111-8111-111111111111';

describe('Admin KYC Review Routes (Integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListPendingReviews.mockResolvedValue({
      data: [{ id: testKycId, status: 'SOUMIS' }],
      pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
    });
    mockGetAdminDetailsById.mockResolvedValue({
      id: testKycId,
      status: 'SOUMIS',
      documents: [{ id: 'doc-1', downloadUrl: 'https://signed.url' }],
      reviewHistory: [],
    });
    mockApproveKyc.mockResolvedValue({
      id: testKycId,
      status: 'VALIDE',
      reviewedByAdminId: 'admin-prof-1',
    });
    mockRejectKyc.mockResolvedValue({
      id: testKycId,
      status: 'REJETE',
      rejectionReason: 'Invalid documents',
      reviewedByAdminId: 'admin-prof-1',
    });
    mockRequestKycCorrection.mockResolvedValue({
      id: testKycId,
      status: 'CORRECTION_REQUISE',
      rejectionReason: 'Please re-upload clearer CNI',
      reviewedByAdminId: 'admin-prof-1',
    });
  });

  // GET /api/v1/admin/kyc
  it('GET /api/v1/admin/kyc returns 401 when not authenticated', async () => {
    const res = await request(app).get('/api/v1/admin/kyc');
    expect(res.status).toBe(401);
  });

  it('GET /api/v1/admin/kyc returns 403 when role is not ADMIN', async () => {
    const res = await request(app)
      .get('/api/v1/admin/kyc')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ACHETEUR');
    expect(res.status).toBe(403);
  });

  it('GET /api/v1/admin/kyc returns 200 with review queue for ADMIN', async () => {
    const res = await request(app)
      .get('/api/v1/admin/kyc')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
  });

  // GET /api/v1/admin/kyc/:id
  it('GET /api/v1/admin/kyc/:id returns 400 for non-UUID param', async () => {
    const res = await request(app)
      .get('/api/v1/admin/kyc/not-a-uuid')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN');
    expect(res.status).toBe(400);
  });

  it('GET /api/v1/admin/kyc/:id returns 200 with details for ADMIN', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/kyc/${testKycId}`)
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.kyc.id).toBe(testKycId);
  });

  // POST /api/v1/admin/kyc/:id/approve
  it('POST /api/v1/admin/kyc/:id/approve returns 401 when unauthenticated', async () => {
    const res = await request(app).post(`/api/v1/admin/kyc/${testKycId}/approve`);
    expect(res.status).toBe(401);
  });

  it('POST /api/v1/admin/kyc/:id/approve returns 403 when not ADMIN', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/kyc/${testKycId}/approve`)
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ACHETEUR');
    expect(res.status).toBe(403);
  });

  it('POST /api/v1/admin/kyc/:id/approve returns 200 when approved by ADMIN', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/kyc/${testKycId}/approve`)
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.kyc.status).toBe('VALIDE');
  });

  // POST /api/v1/admin/kyc/:id/reject
  it('POST /api/v1/admin/kyc/:id/reject returns 400 when reason is missing', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/kyc/${testKycId}/reject`)
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .send({});
    expect(res.status).toBe(400);
  });

  it('POST /api/v1/admin/kyc/:id/reject returns 200 when rejected with reason by ADMIN', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/kyc/${testKycId}/reject`)
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .send({ reason: 'Invalid documents' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.kyc.status).toBe('REJETE');
  });

  // POST /api/v1/admin/kyc/:id/request-correction
  it('POST /api/v1/admin/kyc/:id/request-correction returns 400 when reason is missing', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/kyc/${testKycId}/request-correction`)
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .send({});
    expect(res.status).toBe(400);
  });

  it('POST /api/v1/admin/kyc/:id/request-correction returns 200 when requested with reason by ADMIN', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/kyc/${testKycId}/request-correction`)
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .send({ reason: 'Please re-upload clearer CNI' });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.kyc.status).toBe('CORRECTION_REQUISE');
  });

  describe('GET /api/v1/admin/kyc/:id/history', () => {
    const historyRecord = {
      id: 'hist-1',
      kycId: testKycId,
      action: 'APPROUVER',
      reason: null,
      createdAt: new Date('2026-08-20T10:00:00Z'),
      admin: {
        id: 'admin-profile-1',
        departement: 'Compliance',
        niveauAcces: 'STANDARD',
        user: { email: 'admin@gamalone.com', telephone: '+22891000000' },
      },
    };

    it('returns 200 with history array for authenticated ADMIN', async () => {
      mockGetReviewHistory.mockResolvedValue([historyRecord]);
      const res = await request(app)
        .get(`/api/v1/admin/kyc/${testKycId}/history`)
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'ADMIN');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.history)).toBe(true);
      expect(res.body.history).toHaveLength(1);
    });

    it('returns 200 with empty array when no decisions recorded', async () => {
      mockGetReviewHistory.mockResolvedValue([]);
      const res = await request(app)
        .get(`/api/v1/admin/kyc/${testKycId}/history`)
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'ADMIN');
      expect(res.status).toBe(200);
      expect(res.body.history).toEqual([]);
    });

    it('returns 401 when no bearer token is provided', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/kyc/${testKycId}/history`);
      expect(res.status).toBe(401);
    });

    it('returns 403 for non-ADMIN role', async () => {
      const res = await request(app)
        .get(`/api/v1/admin/kyc/${testKycId}/history`)
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'USER');
      expect(res.status).toBe(403);
    });

    it('propagates 404 when service throws NotFoundError', async () => {
      const { NotFoundError } = await import('../../src/common/errors/AppError.js');
      mockGetReviewHistory.mockRejectedValue(new NotFoundError('KYC record not found'));
      const res = await request(app)
        .get(`/api/v1/admin/kyc/${testKycId}/history`)
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'ADMIN');
      expect(res.status).toBe(404);
    });

    it('propagates 403 when AdminProfile is missing', async () => {
      mockGetReviewHistory.mockRejectedValue(new ForbiddenError('Admin profile not found'));
      const res = await request(app)
        .get(`/api/v1/admin/kyc/${testKycId}/history`)
        .set('Authorization', 'Bearer token')
        .set('x-test-role', 'ADMIN');
      expect(res.status).toBe(403);
    });
  });
});
