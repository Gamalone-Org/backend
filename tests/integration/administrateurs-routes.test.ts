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
const mockUpdate = vi.fn();
const mockUpdatePermissions = vi.fn();
const mockUpdateStatut = vi.fn();

vi.mock('../../src/modules/admin/administrateurs/administrateurs.service.js', () => ({
  AdministrateurService: class {
    list = mockList;
    getById = mockGetOne;
    create = mockCreate;
    update = mockUpdate;
    updatePermissions = mockUpdatePermissions;
    updateStatut = mockUpdateStatut;
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

vi.mock('../../src/config/database.js', () => ({
  prisma: {},
}));

const SUPER_PROFILE_ID = '123e4567-e89b-12d3-a456-426614174001';
const TARGET_PROFILE_ID = '123e4567-e89b-12d3-a456-426614174010';

vi.mock('../../src/modules/auth/middleware/auth.middleware.js', () => {
  const adminDetail = {
    id: 'u-cible',
    email: 'cible@example.com',
    nom: 'Cible',
    telephone: '+22890123456',
    statut: 'ACTIF',
    role: 'ADMIN',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    telephoneVerificationStatus: 'VERIFIE',
    adminProfile: {
      id: TARGET_PROFILE_ID,
      niveauAcces: 'MODERATEUR',
      departement: 'Tech',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      permissions: [{ permission: 'ORDERS_READ' }],
    },
  };

  return {
    requireAuth: (req: any, _res: any, next: any) => {
      if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
        next(new UnauthorizedError('Missing or invalid bearer token'));
        return;
      }
      req.user = {
        id: req.headers['x-test-user-id'] ?? 'admin-1',
        role: req.headers['x-test-role'] ?? 'ADMIN',
        telephone: '+22890123456',
        statut: 'ACTIF',
        adminProfileId: req.headers['x-test-admin-profile-id'] ?? SUPER_PROFILE_ID,
        adminAccessLevel: req.headers['x-test-admin-level'] ?? 'SUPER_ADMIN',
      };
      next();
    },
    requireRole:
      (...roles: string[]) =>
      (req: any, _res: any, next: any) => {
        if (!req.user || !roles.includes(req.user.role)) {
          next(new ForbiddenError('Insufficient permissions'));
          return;
        }
        next();
      },
    requireAdminLevel: () => (req: any, _res: any, next: any) => {
      next();
    },
    requirePermission:
      (...required: string[]) =>
      (req: any, _res: any, next: any) => {
        if (!req.user) {
          next(new UnauthorizedError('Authentication required'));
          return;
        }
        if (req.user.role !== 'ADMIN') {
          next(new ForbiddenError('Admin access required'));
          return;
        }
        if (req.user.adminAccessLevel === 'SUPER_ADMIN') {
          next();
          return;
        }
        const allowed: string[] = (req.headers['x-test-permissions'] ?? '')
          .split(',')
          .filter(Boolean);
        const ok = required.every((p) => allowed.includes(p));
        next(ok ? undefined : new ForbiddenError('Insufficient permissions'));
      },
    _adminDetail: adminDetail,
  };
});

const app = (await import('../../src/app.js')).default;

const headers = (permissions: string[] = [], level = 'SUPPORT') => ({
  Authorization: 'Bearer test-token',
  'x-test-admin-level': level,
  'x-test-permissions': permissions.join(','),
});

const targetUrl = (suffix = '') => `/api/v1/admin/administrateurs${suffix}`;

describe('Routes ADMINISTRATEURS - permissions (Integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20, totalPages: 0 });
    mockGetOne.mockResolvedValue({
      id: 'u-cible',
      email: 'cible@example.com',
      telephone: '+22890123456',
      statut: 'ACTIF',
      role: 'ADMIN',
      adminProfile: {
        id: TARGET_PROFILE_ID,
        niveauAcces: 'MODERATEUR',
        permissions: [],
      },
    });
    mockCreate.mockResolvedValue(mockGetOne.mock.results[0]?.value ?? { id: 'u-cible' });
    mockUpdate.mockResolvedValue(mockGetOne.mock.results[0]?.value ?? { id: 'u-cible' });
    mockUpdatePermissions.mockResolvedValue(mockGetOne.mock.results[0]?.value ?? { id: 'u-cible' });
    mockUpdateStatut.mockResolvedValue(mockGetOne.mock.results[0]?.value ?? { id: 'u-cible' });
  });

  describe('requirePermission - refus sans permission', () => {
    it('GET / sans permission → 403', async () => {
      await request(app)
        .get(targetUrl())
        .set({ Authorization: 'Bearer test-token', 'x-test-admin-level': 'SUPPORT' })
        .expect(403);
      expect(mockList).not.toHaveBeenCalled();
    });

    it('GET / sans Bearer → 401', async () => {
      await request(app).get(targetUrl()).expect(401);
    });

    it('GET / avec permission → 200', async () => {
      await request(app)
        .get(targetUrl())
        .set(headers(['ADMINS_READ']))
        .expect(200);
      expect(mockList).toHaveBeenCalled();
    });

    it('GET /:id sans permission ADMINS_READ → 403', async () => {
      await request(app)
        .get(targetUrl(`/${TARGET_PROFILE_ID}`))
        .set(headers([]))
        .expect(403);
      expect(mockGetOne).not.toHaveBeenCalled();
    });

    it('GET /:id avec ADMINS_READ → 200', async () => {
      await request(app)
        .get(targetUrl(`/${TARGET_PROFILE_ID}`))
        .set(headers(['ADMINS_READ']))
        .expect(200);
      expect(mockGetOne).toHaveBeenCalledWith(expect.anything(), TARGET_PROFILE_ID);
    });
  });

  describe('POST / - ADMINS_CREATE', () => {
    it('refuse sans ADMINS_CREATE', async () => {
      await request(app)
        .post(targetUrl())
        .set(headers(['ADMINS_READ']))
        .send({ nom: 'A', telephone: '+22890123456', motDePasse: 'S3cretPass!' })
        .expect(403);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it('autorise avec ADMINS_CREATE', async () => {
      await request(app)
        .post(targetUrl())
        .set(headers(['ADMINS_CREATE']))
        .send({ nom: 'Awa', telephone: '+22890123456', motDePasse: 'S3cretPass!' })
        .expect(201);
      expect(mockCreate).toHaveBeenCalled();
    });
  });

  describe('PATCH /:id - ADMINS_UPDATE', () => {
    it('refuse sans ADMINS_UPDATE', async () => {
      await request(app)
        .patch(targetUrl(`/${TARGET_PROFILE_ID}`))
        .set(headers(['ADMINS_READ']))
        .send({ nom: 'B' })
        .expect(403);
      expect(mockUpdate).not.toHaveBeenCalled();
    });

    it('autorise avec ADMINS_UPDATE', async () => {
      await request(app)
        .patch(targetUrl(`/${TARGET_PROFILE_ID}`))
        .set(headers(['ADMINS_UPDATE']))
        .send({ departement: 'IT' })
        .expect(200);
      expect(mockUpdate).toHaveBeenCalled();
    });
  });

  describe('PATCH /:id/permissions - ADMINS_MANAGE', () => {
    it('refuse sans ADMINS_MANAGE', async () => {
      await request(app)
        .patch(targetUrl(`/${TARGET_PROFILE_ID}/permissions`))
        .set(headers(['ADMINS_UPDATE']))
        .send({ permissions: ['USERS_READ'] })
        .expect(403);
      expect(mockUpdatePermissions).not.toHaveBeenCalled();
    });

    it('autorise avec ADMINS_MANAGE', async () => {
      await request(app)
        .patch(targetUrl(`/${TARGET_PROFILE_ID}/permissions`))
        .set(headers(['ADMINS_MANAGE']))
        .send({ permissions: ['USERS_READ', 'ORDERS_READ'] })
        .expect(200);
      expect(mockUpdatePermissions).toHaveBeenCalled();
    });
  });

  describe('PATCH /:id/statut - ADMINS_UPDATE', () => {
    it('refuse sans ADMINS_UPDATE', async () => {
      await request(app)
        .patch(targetUrl(`/${TARGET_PROFILE_ID}/statut`))
        .set(headers(['ADMINS_MANAGE']))
        .send({ statut: 'INACTIF' })
        .expect(403);
      expect(mockUpdateStatut).not.toHaveBeenCalled();
    });

    it('autorise avec ADMINS_UPDATE', async () => {
      await request(app)
        .patch(targetUrl(`/${TARGET_PROFILE_ID}/statut`))
        .set(headers(['ADMINS_UPDATE']))
        .send({ statut: 'SUSPENDU' })
        .expect(200);
      expect(mockUpdateStatut).toHaveBeenCalled();
    });
  });
});
