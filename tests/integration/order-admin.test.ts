import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import {
  ForbiddenError,
  UnauthorizedError,
  ConflictError,
  NotFoundError,
} from '../../src/common/errors/AppError.js';

const mockCreate = vi.fn();
const mockListMine = vi.fn();
const mockGetMine = vi.fn();
const mockListAdmin = vi.fn();
const mockGetAdmin = vi.fn();
const mockUpdateStatut = vi.fn();
const mockAnnuler = vi.fn();
const mockExportCsv = vi.fn();

vi.mock('../../src/modules/orders/order.service.js', () => ({
  OrderService: class {
    createCommande = mockCreate;
    getMyCommandes = mockListMine;
    getMyCommande = mockGetMine;
    getAllAdmin = mockListAdmin;
    getCommandeAdmin = mockGetAdmin;
    updateStatut = mockUpdateStatut;
    annuler = mockAnnuler;
    exportCsv = mockExportCsv;
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

vi.mock('../../src/modules/auth/middleware/auth.middleware.js', () => ({
  requireAuth: (req: any, _res: any, next: any) => {
    const authorization = req.headers.authorization;
    if (!authorization || !authorization.startsWith('Bearer ')) {
      next(new UnauthorizedError('Missing or invalid bearer token'));
      return;
    }

    req.user = {
      id: req.headers['x-test-user-id'] ?? 'acheteur-1',
      role: req.headers['x-test-role'] ?? 'ACHETEUR',
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
  requireAdminLevel: () => (_req: any, _res: any, next: any) => next(),
  requirePermission: (...permissions: string[]) => (_req: any, _res: any, next: any) => next(),
}));

const app = (await import('../../src/app.js')).default;

const CMD_ID = '123e4567-e89b-12d3-a456-426614174000';
const OEUVRE_ID = '123e4567-e89b-12d3-a456-426614174100';

const createBody = {
  articles: [{ oeuvreId: OEUVRE_ID, quantite: 2 }],
  adresseLivraison: 'LomÃ©, Tokoin, Rue 12',
  transporteur: 'DHL',
  fraisLivraison: 1000,
  methodePaiement: 'MOBILE_MONEY',
};

describe('Orders routes (Integration)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreate.mockResolvedValue({
      commande: { id: CMD_ID, statut: 'COMMANDE' },
      recapitulatif: { sousTotal: 20000, fraisLivraison: 1000, total: 21000, commission: 2000 },
    });
    mockListAdmin.mockResolvedValue({ commandes: [], total: 0, page: 1, limit: 20 });
    mockGetAdmin.mockResolvedValue({ id: CMD_ID, statut: 'COMMANDE' });
    mockUpdateStatut.mockResolvedValue({ id: CMD_ID, statut: 'PREPARATION' });
    mockAnnuler.mockResolvedValue({ id: CMD_ID, statut: 'ANNULEE' });
    mockExportCsv.mockResolvedValue('numero,date\n');
  });

  it('ACHETEUR creates an order (201)', async () => {
    const res = await request(app)
      .post('/api/v1/commandes')
      .set('Authorization', 'Bearer token')
      .set('x-test-user-id', 'acheteur-1')
      .set('x-test-role', 'ACHETEUR')
      .send(createBody);

    expect(res.status).toBe(201);
    expect(mockCreate).toHaveBeenCalledWith('acheteur-1', createBody);
  });

  it('ARTISAN is forbidden from creating an order (403)', async () => {
    const res = await request(app)
      .post('/api/v1/commandes')
      .set('Authorization', 'Bearer token')
      .set('x-test-user-id', 'artisan-1')
      .set('x-test-role', 'ARTISAN')
      .send(createBody);

    expect(res.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rejects an order payload with an invalid quantity (400)', async () => {
    const res = await request(app)
      .post('/api/v1/commandes')
      .set('Authorization', 'Bearer token')
      .set('x-test-user-id', 'acheteur-1')
      .set('x-test-role', 'ACHETEUR')
      .send({ ...createBody, articles: [{ oeuvreId: OEUVRE_ID, quantite: 0 }] });

    expect(res.status).toBe(400);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it('rejects an order payload with a negative shipping fee (400)', async () => {
    const res = await request(app)
      .post('/api/v1/commandes')
      .set('Authorization', 'Bearer token')
      .set('x-test-user-id', 'acheteur-1')
      .set('x-test-role', 'ACHETEUR')
      .send({ ...createBody, fraisLivraison: -5 });

    expect(res.status).toBe(400);
  });

  it('requires authentication to create an order (401)', async () => {
    const res = await request(app).post('/api/v1/commandes').send(createBody);
    expect(res.status).toBe(401);
  });

  it('ACHETEUR lists only its own orders (200)', async () => {
    mockListMine.mockResolvedValue({ commandes: [], total: 0, page: 1, limit: 20 });
    const res = await request(app)
      .get('/api/v1/commandes')
      .set('Authorization', 'Bearer token')
      .set('x-test-user-id', 'acheteur-1')
      .set('x-test-role', 'ACHETEUR');

    expect(res.status).toBe(200);
    expect(mockListMine).toHaveBeenCalledWith('acheteur-1', 1, 20, {
      statuts: undefined,
      q: undefined,
      tri: undefined,
    });
  });

  it('ACHETEUR filters its orders by a single status (200)', async () => {
    mockListMine.mockResolvedValue({ commandes: [], total: 0, page: 1, limit: 20 });
    const res = await request(app)
      .get('/api/v1/commandes')
      .set('Authorization', 'Bearer token')
      .set('x-test-user-id', 'acheteur-1')
      .set('x-test-role', 'ACHETEUR')
      .query({ statut: 'PREPARATION' });

    expect(res.status).toBe(200);
    expect(mockListMine).toHaveBeenCalledWith('acheteur-1', 1, 20, {
      statuts: ['PREPARATION'],
      q: undefined,
      tri: undefined,
    });
  });

  it('ACHETEUR filters its orders by several statuses (200)', async () => {
    mockListMine.mockResolvedValue({ commandes: [], total: 0, page: 1, limit: 20 });
    const res = await request(app)
      .get('/api/v1/commandes')
      .set('Authorization', 'Bearer token')
      .set('x-test-user-id', 'acheteur-1')
      .set('x-test-role', 'ACHETEUR')
      .query({ statut: 'COMMANDE,PREPARATION,EXPEDIEE' });

    expect(res.status).toBe(200);
    expect(mockListMine).toHaveBeenCalledWith('acheteur-1', 1, 20, {
      statuts: ['COMMANDE', 'PREPARATION', 'EXPEDIEE'],
      q: undefined,
      tri: undefined,
    });
  });

  it('rejects an invalid status filter (400)', async () => {
    const res = await request(app)
      .get('/api/v1/commandes')
      .set('Authorization', 'Bearer token')
      .set('x-test-user-id', 'acheteur-1')
      .set('x-test-role', 'ACHETEUR')
      .query({ statut: 'INVENTED_STATUS' });

    expect(res.status).toBe(400);
    expect(mockListMine).not.toHaveBeenCalled();
  });

  it('ACHETEUR searches its orders (200)', async () => {
    mockListMine.mockResolvedValue({ commandes: [], total: 0, page: 1, limit: 20 });
    const res = await request(app)
      .get('/api/v1/commandes')
      .set('Authorization', 'Bearer token')
      .set('x-test-user-id', 'acheteur-1')
      .set('x-test-role', 'ACHETEUR')
      .query({ q: 'sculpture' });

    expect(res.status).toBe(200);
    expect(mockListMine).toHaveBeenCalledWith('acheteur-1', 1, 20, {
      statuts: undefined,
      q: 'sculpture',
      tri: undefined,
    });
  });

  it('ACHETEUR picks the sort order (200)', async () => {
    mockListMine.mockResolvedValue({ commandes: [], total: 0, page: 1, limit: 20 });
    const res = await request(app)
      .get('/api/v1/commandes')
      .set('Authorization', 'Bearer token')
      .set('x-test-user-id', 'acheteur-1')
      .set('x-test-role', 'ACHETEUR')
      .query({ tri: 'dateCreation_asc' });

    expect(res.status).toBe(200);
    expect(mockListMine).toHaveBeenCalledWith('acheteur-1', 1, 20, {
      statuts: undefined,
      q: undefined,
      tri: 'dateCreation_asc',
    });
  });

  it('rejects an invalid tri value (400)', async () => {
    const res = await request(app)
      .get('/api/v1/commandes')
      .set('Authorization', 'Bearer token')
      .set('x-test-user-id', 'acheteur-1')
      .set('x-test-role', 'ACHETEUR')
      .query({ tri: 'not-a-sort' });

    expect(res.status).toBe(400);
    expect(mockListMine).not.toHaveBeenCalled();
  });

  it('combines pagination and status filter (200)', async () => {
    mockListMine.mockResolvedValue({ commandes: [], total: 3, page: 2, limit: 10 });
    const res = await request(app)
      .get('/api/v1/commandes')
      .set('Authorization', 'Bearer token')
      .set('x-test-user-id', 'acheteur-1')
      .set('x-test-role', 'ACHETEUR')
      .query({ page: '2', limit: '10', statut: 'PREPARATION' });

    expect(res.status).toBe(200);
    expect(mockListMine).toHaveBeenCalledWith('acheteur-1', 2, 10, {
      statuts: ['PREPARATION'],
      q: undefined,
      tri: undefined,
    });
  });

  it('returns the multi-artisan card structure in the buyer list', async () => {
    mockListMine.mockResolvedValue({
      commandes: [
        {
          id: CMD_ID,
          statut: 'PREPARATION',
          typeCommande: 'STANDARD',
          montantTotal: 32000,
          fraisLivraison: 1000,
          commission: 2000,
          commandesArtisans: [
            {
              id: 'ca-1',
              statut: 'PREPARATION',
              sousTotal: 20000,
              montantTotal: 21000,
              artisan: { id: 'art-1', nomAtelier: 'Atelier A', user: { nom: 'Awa' } },
            },
            {
              id: 'ca-2',
              statut: 'COMMANDE',
              sousTotal: 10000,
              montantTotal: 11000,
              artisan: { id: 'art-2', nomAtelier: 'Atelier B', user: { nom: 'Kossi' } },
            },
          ],
          lignesCommande: [
            {
              id: 'lc-1',
              quantite: 2,
              commandeArtisanId: 'ca-1',
              oeuvre: {
                id: OEUVRE_ID,
                titre: 'Sculpture',
                medias: [{ id: 'm-1', url: 'https://cdn.gamalone.test/oeuvre-1.jpg' }],
              },
              artisan: { id: 'art-1', nomAtelier: 'Atelier A', user: { nom: 'Awa' } },
            },
            {
              id: 'lc-2',
              quantite: 1,
              commandeArtisanId: 'ca-2',
              oeuvre: { id: 'oeuvre-2', titre: 'Masque', medias: [] },
              artisan: { id: 'art-2', nomAtelier: 'Atelier B', user: { nom: 'Kossi' } },
            },
          ],
          paiement: { id: 'pay-1', statut: 'REUSSI', methode: 'MOBILE_MONEY', montant: 32000 },
          livraison: {
            id: 'del-1',
            statut: 'PREPAREE',
            transporteur: 'DHL',
            numeroSuivi: 'TG48-851',
          },
        },
      ],
      total: 3,
      page: 1,
      limit: 20,
    });

    const res = await request(app)
      .get('/api/v1/commandes')
      .set('Authorization', 'Bearer token')
      .set('x-test-user-id', 'acheteur-1')
      .set('x-test-role', 'ACHETEUR');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.commandes).toHaveLength(1);
    const order = res.body.commandes[0];
    expect(order.commandesArtisans).toHaveLength(2);
    expect(order.commandesArtisans.map((ca: any) => ca.artisan.nomAtelier)).toEqual([
      'Atelier A',
      'Atelier B',
    ]);
    expect(order.lignesCommande).toHaveLength(2);
    expect(order.lignesCommande[0].oeuvre.medias[0].url).toBe('https://cdn.gamalone.test/oeuvre-1.jpg');
    expect(order.livraison.numeroSuivi).toBe('TG48-851');
    expect(order.livraison.transporteur).toBe('DHL');
    expect(res.body.total).toBe(3);
  });

  it('ACHETEUR gets its own order (200)', async () => {
    mockGetMine.mockResolvedValue({ id: CMD_ID });
    const res = await request(app)
      .get(`/api/v1/commandes/${CMD_ID}`)
      .set('Authorization', 'Bearer token')
      .set('x-test-user-id', 'acheteur-1')
      .set('x-test-role', 'ACHETEUR');

    expect(res.status).toBe(200);
    expect(mockGetMine).toHaveBeenCalledWith('acheteur-1', CMD_ID);
  });

  it('ADMIN lists all orders (200)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/commandes')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .query({ statut: 'COMMANDE', q: 'awa' });

    expect(res.status).toBe(200);
    expect(mockListAdmin).toHaveBeenCalled();
  });

  it('ACHETEUR is forbidden from admin listing (403)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/commandes')
      .set('Authorization', 'Bearer token')
      .set('x-test-user-id', 'acheteur-1')
      .set('x-test-role', 'ACHETEUR');

    expect(res.status).toBe(403);
  });

  it('ADMIN controls the status (200)', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/commandes/${CMD_ID}/statut`)
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .send({ statut: 'PREPARATION' });

    expect(res.status).toBe(200);
    expect(mockUpdateStatut).toHaveBeenCalledWith(CMD_ID, 'PREPARATION');
  });

  it('ARTISAN is forbidden from status control (403)', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/commandes/${CMD_ID}/statut`)
      .set('Authorization', 'Bearer token')
      .set('x-test-user-id', 'artisan-1')
      .set('x-test-role', 'ARTISAN')
      .send({ statut: 'PREPARATION' });

    expect(res.status).toBe(403);
  });

  it('propagates a ConflictError for an invalid transition (409)', async () => {
    mockUpdateStatut.mockRejectedValue(
      new ConflictError('Transition de statut invalide')
    );
    const res = await request(app)
      .post(`/api/v1/admin/commandes/${CMD_ID}/statut`)
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN')
      .send({ statut: 'LIVREE' });

    expect(res.status).toBe(409);
  });

  it('ADMIN cancels an order (200)', async () => {
    const res = await request(app)
      .post(`/api/v1/admin/commandes/${CMD_ID}/annuler`)
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN');

    expect(res.status).toBe(200);
    expect(mockAnnuler).toHaveBeenCalledWith(CMD_ID);
  });

  it('propagates a NotFoundError when the order does not exist (404)', async () => {
    mockGetAdmin.mockRejectedValue(new NotFoundError('Commande introuvable'));
    const res = await request(app)
      .get(`/api/v1/admin/commandes/${CMD_ID}`)
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN');

    expect(res.status).toBe(404);
  });

  it('ADMIN exports orders as CSV (200, text/csv)', async () => {
    const res = await request(app)
      .get('/api/v1/admin/commandes/export')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN');

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(mockExportCsv).toHaveBeenCalled();
  });

  it('routes export before :id so the id param is not matched', async () => {
    const res = await request(app)
      .get('/api/v1/admin/commandes/export')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ADMIN');

    expect(res.status).toBe(200);
    expect(mockExportCsv).toHaveBeenCalled();
    expect(mockGetAdmin).not.toHaveBeenCalled();
  });
});
