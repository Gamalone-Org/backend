import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
} from '../../src/common/errors/AppError.js';

const mockList = vi.fn();
const mockGetOne = vi.fn();
const mockCreate = vi.fn();
const mockUpdateStatut = vi.fn();
const mockUpdateRole = vi.fn();
const mockExport = vi.fn();

vi.mock('../../src/modules/users/users.service.js', () => ({
  UserService: class {
    listUsers = mockList;
    getById = mockGetOne;
    createUser = mockCreate;
    updateStatut = mockUpdateStatut;
    updateRole = mockUpdateRole;
    exportUsers = mockExport;
  },
}));

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

vi.mock('../../src/config/database.js', () => ({
  prisma: {},
}));

const ADMIN_LEVEL_RANK: Record<string, number> = {
  SUPPORT: 0,
  MODERATEUR: 1,
  SUPER_ADMIN: 2,
};

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
      adminAccessLevel: req.headers['x-test-admin-level'] ?? 'SUPPORT',
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
  requireAdminLevel: (minimumLevel: string) => (req: any, _res: any, next: any) => {
    const current = req.user?.adminAccessLevel ?? req.headers['x-test-admin-level'];
    if (!current || (ADMIN_LEVEL_RANK[current] ?? -1) < (ADMIN_LEVEL_RANK[minimumLevel] ?? 99)) {
      next(new ForbiddenError('Insufficient admin access level'));
      return;
    }
    next();
  },
  requirePermission: (...permissions: string[]) => (_req: any, _res: any, next: any) => next(),
}));

const app = (await import('../../src/app.js')).default;

const USER_ID = '123e4567-e89b-12d3-a456-426614174010';

const authHeaders = (level: string, role = 'ADMIN') => ({
  Authorization: 'Bearer token',
  'x-test-role': role,
  'x-test-admin-level': level,
});

describe('Routes admin UTILISATEURS - permissions (Integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    mockGetOne.mockResolvedValue({
      id: USER_ID,
      nom: 'Awa Mensah',
      email: 'awa@example.com',
      telephone: '+22890123456',
      role: 'ACHETEUR',
      statut: 'ACTIF',
    });
    mockCreate.mockResolvedValue({
      id: USER_ID,
      telephone: '+22890123456',
      role: 'ACHETEUR',
      statut: 'ACTIF',
    });
    mockUpdateStatut.mockResolvedValue({
      id: USER_ID,
      role: 'ACHETEUR',
      statut: 'SUSPENDU',
    });
    mockUpdateRole.mockResolvedValue({
      id: USER_ID,
      role: 'ADMIN',
      adminProfile: { id: 'a', niveauAcces: 'SUPPORT' },
    });
    mockExport.mockResolvedValue({
      csv: 'id,nom,email,telephone,role,statut,inscription,niveau_admin,profil\n',
    });
  });

  // ---- AUTH ----

  it('requires authentication to list users (401)', async () => {
    const res = await request(app).get('/api/v1/admin/users');
    expect(res.status).toBe(401);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('requires authentication to export users (401)', async () => {
    const res = await request(app).get('/api/v1/admin/users/export');
    expect(res.status).toBe(401);
    expect(mockExport).not.toHaveBeenCalled();
  });

  it('forbids a non-ADMIN role from listing users (403)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/users')
      .set('Authorization', 'Bearer token')
      .set('x-test-user-id', 'acheteur-1')
      .set('x-test-role', 'ACHETEUR');

    expect(res.status).toBe(403);
    expect(mockList).not.toHaveBeenCalled();
  });

  // ---- NIVEAUX : SUPPORT (lecture) ----

  it('SUPPORT is allowed to list users (200) avec totalPages', async () => {
    mockList.mockResolvedValue({
      items: [{ id: USER_ID, role: 'ACHETEUR', statut: 'ACTIF' }],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    const res = await request(app)
      .get('/api/v1/admin/users')
      .set(authHeaders('SUPPORT'));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.totalPages).toBe(1);
  });

  it('SUPPORT is allowed to get a user detail (200)', async () => {
    const res = await request(app)
      .get(`/api/v1/admin/users/${USER_ID}`)
      .set(authHeaders('SUPPORT'));

    expect(res.status).toBe(200);
    expect(mockGetOne).toHaveBeenCalledWith(expect.anything(), USER_ID);
  });

  it('SUPPORT is allowed to export users as CSV (200)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/users/export')
      .set(authHeaders('SUPPORT'));

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(mockExport).toHaveBeenCalled();
  });

  // ---- NIVEAUX : Ã©criture restreinte ----

  it('forbids SUPPORT from creating a user (403)', async () => {
    const res = await request(app)
      .post('/api/v1/admin/users')
      .set(authHeaders('SUPPORT'))
      .send({ role: 'ACHETEUR', telephone: '+22890123456', motDePasse: 'S3cretPass!' });

    expect(res.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('forbids MODERATEUR from changing a role (403)', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/users/${USER_ID}/role`)
      .set(authHeaders('MODERATEUR'))
      .send({ role: 'ADMIN', niveauAcces: 'SUPPORT' });

    expect(res.status).toBe(403);
    expect(mockUpdateRole).not.toHaveBeenCalled();
  });

  it('SUPER_ADMIN can create a user (201)', async () => {
    const res = await request(app)
      .post('/api/v1/admin/users')
      .set(authHeaders('SUPER_ADMIN'))
      .send({ role: 'ACHETEUR', telephone: '+22890123456', motDePasse: 'S3cretPass!', nom: 'Awa' });

    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalled();
  });

  // ---- ROUTES ----

  it('routes /export before /:id so the id param is not matched', async () => {
    const res = await request(app)
      .get('/api/v1/admin/users/export')
      .set(authHeaders('SUPPORT'));

    expect(res.status).toBe(200);
    expect(mockExport).toHaveBeenCalled();
    expect(mockGetOne).not.toHaveBeenCalled();
  });

  // ---- VALIDATION ----

  it('forbids an invalid role filter (400)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/users')
      .set(authHeaders('SUPPORT'))
      .query({ role: 'INVALIDE' });

    expect(res.status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('forbids an invalid statut filter (400)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/users')
      .set(authHeaders('SUPPORT'))
      .query({ statut: 'REFUSE' });

    expect(res.status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('forbids an invalid user id in the detail path (400)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/users/not-a-uuid')
      .set(authHeaders('SUPPORT'));

    expect(res.status).toBe(400);
    expect(mockGetOne).not.toHaveBeenCalled();
  });

  // ---- FILTRES & PAGINATION ----

  it('passes page and limit to the service (200)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/users')
      .set(authHeaders('SUPPORT'))
      .query({ page: 2, limit: 10 });

    expect(res.status).toBe(200);
    expect(mockList).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ page: 2, limit: 10 })
    );
  });

  it('returns totalPages = 0 when total = 0', async () => {
    const res = await request(app)
      .get('/api/v1/admin/users')
      .set(authHeaders('SUPPORT'));

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(0);
    expect(res.body.totalPages).toBe(0);
  });

  it('propagates export filters without pagination (200)', async () => {
    await request(app)
      .get('/api/v1/admin/users/export')
      .set(authHeaders('SUPPORT'))
      .query({ q: 'awa', bloques: 'true' });

    expect(mockExport).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ q: 'awa', bloques: true })
    );
  });

  // ---- ERREURS ----

  it('propagates a NotFoundError when the user does not exist (404)', async () => {
    mockGetOne.mockRejectedValue(new NotFoundError('Utilisateur non trouvÃ©'));
    const res = await request(app)
      .get(`/api/v1/admin/users/${USER_ID}`)
      .set(authHeaders('SUPPORT'));

    expect(res.status).toBe(404);
  });

  it('propagates a ForbiddenError on self status change (403)', async () => {
    mockUpdateStatut.mockRejectedValue(
      new ForbiddenError('Un administrateur ne peut pas modifier son propre statut')
    );
    const res = await request(app)
      .patch(`/api/v1/admin/users/${USER_ID}/statut`)
      .set(authHeaders('MODERATEUR'))
      .send({ statut: 'SUSPENDU' });

    expect(res.status).toBe(403);
  });
});
