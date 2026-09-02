import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { NotFoundError, ForbiddenError, ConflictError } from '../../src/common/errors/AppError.js';

const USER_ID = '123e4567-e89b-12d3-a456-426614174010';

const makeUser = (overrides = {}) => ({
  id: USER_ID,
  nom: 'Awa Mensah',
  email: 'awa@example.com',
  telephone: '+22890123456',
  role: 'ACHETEUR',
  statut: 'ACTIF',
  telephoneVerificationStatus: 'VERIFIE',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  artisanProfile: null,
  buyerProfile: { id: '123e4567-e89b-12d3-a456-426614174020', typeClient: 'PARTICULIER' },
  adminProfile: null,
  ...overrides,
});

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

vi.mock('../../src/modules/auth/middleware/auth.middleware.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    req.user = { id: 'admin-1', role: 'ADMIN', adminAccessLevel: 'MODERATEUR' };
    next();
  },
  requireRole: () => (_req: any, _res: any, next: any) => next(),
  requireAdminLevel: () => (_req: any, _res: any, next: any) => next(),
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

const app = (await import('../../src/app.js')).default;

describe('Routes admin UTILISATEURS', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 });
    mockGetOne.mockResolvedValue(makeUser());
    mockCreate.mockResolvedValue(makeUser());
    mockUpdateStatut.mockResolvedValue(makeUser({ statut: 'SUSPENDU' }));
    mockUpdateRole.mockResolvedValue(
      makeUser({ role: 'ADMIN', adminProfile: { id: 'a', niveauAcces: 'SUPPORT' } })
    );
    mockExport.mockResolvedValue({ csv: 'id,nom\n' });
  });

  it('GET /api/v1/admin/users liste les utilisateurs', async () => {
    const res = await request(app).get('/api/v1/admin/users');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('success', true);
    expect(mockList).toHaveBeenCalled();
  });

  it('GET /api/v1/admin/users propage les filtres de la requête', async () => {
    await request(app).get('/api/v1/admin/users?role=ACHETEUR&statut=SUSPENDU&bloques=true&q=awa');
    expect(mockList).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ role: 'ACHETEUR', statut: 'SUSPENDU', bloques: true, q: 'awa' })
    );
  });

  it('GET /api/v1/admin/users retourne 400 sur un filtre invalide', async () => {
    const res = await request(app).get('/api/v1/admin/users?role=INVALIDE');
    expect(res.status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('GET /api/v1/admin/users/:id retourne le détail', async () => {
    const res = await request(app).get(`/api/v1/admin/users/${USER_ID}`);
    expect(res.status).toBe(200);
    expect(mockGetOne).toHaveBeenCalledWith(expect.anything(), USER_ID);
  });

  it('GET /api/v1/admin/users/:id retourne 404 si absent', async () => {
    mockGetOne.mockRejectedValueOnce(new NotFoundError('Utilisateur non trouvé'));
    const res = await request(app).get(`/api/v1/admin/users/${USER_ID}`);
    expect(res.status).toBe(404);
  });

  it('POST /api/v1/admin/users crée un utilisateur', async () => {
    const res = await request(app).post('/api/v1/admin/users').send({
      role: 'ACHETEUR',
      telephone: '+22890123456',
      motDePasse: 'S3cretPass!',
      nom: 'Awa',
    });
    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalled();
  });

  it('POST /api/v1/admin/users retourne 400 sur validation Zod', async () => {
    const res = await request(app).post('/api/v1/admin/users').send({ role: 'ACHETEUR' });
    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('POST /api/v1/admin/users retourne 409 sur conflit téléphone', async () => {
    mockCreate.mockRejectedValueOnce(new ConflictError('Un compte avec ce numéro de téléphone existe déjà'));
    const res = await request(app).post('/api/v1/admin/users').send({
      role: 'ACHETEUR',
      telephone: '+22890123456',
      motDePasse: 'S3cretPass!',
    });
    expect(res.status).toBe(409);
  });

  it('PATCH /api/v1/admin/users/:id/statut change le statut', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/users/${USER_ID}/statut`)
      .send({ statut: 'SUSPENDU' });
    expect(res.status).toBe(200);
    expect(mockUpdateStatut).toHaveBeenCalled();
  });

  it('PATCH /api/v1/admin/users/:id/statut retourne 403 si auto-modification', async () => {
    mockUpdateStatut.mockRejectedValueOnce(
      new ForbiddenError('Un administrateur ne peut pas modifier son propre statut')
    );
    const res = await request(app)
      .patch(`/api/v1/admin/users/${USER_ID}/statut`)
      .send({ statut: 'SUSPENDU' });
    expect(res.status).toBe(403);
  });

  it('PATCH /api/v1/admin/users/:id/role change le rôle (SUPER_ADMIN côté service)', async () => {
    const res = await request(app)
      .patch(`/api/v1/admin/users/${USER_ID}/role`)
      .send({ role: 'ADMIN', niveauAcces: 'SUPPORT' });
    expect(res.status).toBe(200);
    expect(mockUpdateRole).toHaveBeenCalled();
  });

  it('PATCH /api/v1/admin/users/:id/role retourne 403 si niveau insuffisant', async () => {
    mockUpdateRole.mockRejectedValueOnce(new ForbiddenError('Niveau SUPER_ADMIN requis'));
    const res = await request(app)
      .patch(`/api/v1/admin/users/${USER_ID}/role`)
      .send({ role: 'ADMIN', niveauAcces: 'SUPPORT' });
    expect(res.status).toBe(403);
  });

  it('GET /api/v1/admin/users/export retourne le CSV', async () => {
    const res = await request(app).get('/api/v1/admin/users/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.text).toBe('id,nom\n');
  });
});
