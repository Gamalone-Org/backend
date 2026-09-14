import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import {
  ForbiddenError,
  UnauthorizedError,
  NotFoundError,
  ConflictError,
  ValidationError,
} from '../../src/common/errors/AppError.js';

const mockGetMyProfile = vi.fn();
const mockUpdateMyProfile = vi.fn();
const mockUploadPhotoProfil = vi.fn();
const mockDeletePhotoProfil = vi.fn();
const mockUploadBanniere = vi.fn();
const mockDeleteBanniere = vi.fn();
const mockGetAtelierPhotos = vi.fn();
const mockUploadAtelierPhoto = vi.fn();
const mockDeleteAtelierPhoto = vi.fn();
const mockReorderAtelierPhotos = vi.fn();
const mockGetProcessus = vi.fn();
const mockCreateProcessusEtape = vi.fn();
const mockUpdateProcessusEtape = vi.fn();
const mockDeleteProcessusEtape = vi.fn();
const mockUploadProcessusPhoto = vi.fn();
const mockReorderProcessus = vi.fn();
const mockGetExpositions = vi.fn();
const mockCreateExposition = vi.fn();
const mockUpdateExposition = vi.fn();
const mockDeleteExposition = vi.fn();
const mockUpdateVersement = vi.fn();

vi.mock('../../src/modules/artisan-profile/artisan-profile.service.js', () => ({
  ArtisanProfileService: class {
    getMyProfile = mockGetMyProfile;
    updateMyProfile = mockUpdateMyProfile;
    uploadPhotoProfil = mockUploadPhotoProfil;
    deletePhotoProfil = mockDeletePhotoProfil;
    uploadBanniere = mockUploadBanniere;
    deleteBanniere = mockDeleteBanniere;
    getAtelierPhotos = mockGetAtelierPhotos;
    uploadAtelierPhoto = mockUploadAtelierPhoto;
    deleteAtelierPhoto = mockDeleteAtelierPhoto;
    reorderAtelierPhotos = mockReorderAtelierPhotos;
    getProcessus = mockGetProcessus;
    createProcessusEtape = mockCreateProcessusEtape;
    updateProcessusEtape = mockUpdateProcessusEtape;
    deleteProcessusEtape = mockDeleteProcessusEtape;
    uploadProcessusPhoto = mockUploadProcessusPhoto;
    reorderProcessus = mockReorderProcessus;
    getExpositions = mockGetExpositions;
    createExposition = mockCreateExposition;
    updateExposition = mockUpdateExposition;
    deleteExposition = mockDeleteExposition;
    updateVersement = mockUpdateVersement;
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
      id: req.headers['x-test-user-id'] ?? 'artisan-1',
      role: req.headers['x-test-role'] ?? 'ARTISAN',
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

const ARTISAN_ID = '123e4567-e89b-12d3-a456-426614174111';
const PHOTO_ID = '123e4567-e89b-12d3-a456-426614174222';
const ETAPE_ID = '123e4567-e89b-12d3-a456-426614174333';
const EXP_ID = '123e4567-e89b-12d3-a456-426614174444';

describe('Artisan profile routes â€” authentication & roles', () => {
  beforeEach(() => vi.clearAllMocks());

  it('rejects without a bearer token (401)', async () => {
    const res = await request(app).get('/api/v1/artisan/profil');
    expect(res.status).toBe(401);
  });

  it('rejects a buyer role (403)', async () => {
    const res = await request(app)
      .get('/api/v1/artisan/profil')
      .set('Authorization', 'Bearer token')
      .set('x-test-user-id', 'acheteur-1')
      .set('x-test-role', 'ACHETEUR');
    expect(res.status).toBe(403);
  });

  it('accepts an ARTISAN role on GET /profil (200)', async () => {
    mockGetMyProfile.mockResolvedValue({ id: ARTISAN_ID, nomAtelier: 'Atelier AdjÃ©vi' });
    const res = await request(app)
      .get('/api/v1/artisan/profil')
      .set('Authorization', 'Bearer token')
      .set('x-test-user-id', 'artisan-1')
      .set('x-test-role', 'ARTISAN');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.profil.nomAtelier).toBe('Atelier AdjÃ©vi');
    expect(mockGetMyProfile).toHaveBeenCalledWith('artisan-1');
  });
});

describe('Artisan profile routes â€” GET/PATCH profil', () => {
  beforeEach(() => vi.clearAllMocks());

  it('GET returns the full profile', async () => {
    mockGetMyProfile.mockResolvedValue({
      id: ARTISAN_ID,
      nomAtelier: 'Atelier AdjÃ©vi',
      devise: 'XOF',
      langue: 'fr',
      preparationMinDays: 2,
      preparationMaxDays: 5,
      atelierPhotos: [],
      processusEtapes: [],
      expositions: [],
      paiementPreference: null,
    });
    const res = await request(app)
      .get('/api/v1/artisan/profil')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN');
    expect(res.status).toBe(200);
    expect(res.body.profil.id).toBe(ARTISAN_ID);
  });

  it('GET /profil expose la source de vÃ©ritÃ© boutique sur ArtisanProfile (pas de boutiqueSetting)', async () => {
    mockGetMyProfile.mockResolvedValue({
      id: ARTISAN_ID,
      devise: 'XOF',
      langue: 'fr',
      preparationMinDays: 2,
      preparationMaxDays: 5,
    });
    const res = await request(app)
      .get('/api/v1/artisan/profil')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN');

    const body = JSON.stringify(res.body);
    expect(body).toContain('XOF');
    expect(body).toContain('preparationMinDays');
    expect(body).not.toContain('boutiqueSetting');
  });

  it('PATCH updates allowed fields (200)', async () => {
    mockUpdateMyProfile.mockImplementation(async (_userId: string, input: never) => ({
      id: ARTISAN_ID,
      ...input,
    }));
    const res = await request(app)
      .patch('/api/v1/artisan/profil')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN')
      .send({ nomAtelier: 'Atelier AdjÃ©vi', ville: 'KpalimÃ©', pays: 'Togo' });
    expect(res.status).toBe(200);
    expect(mockUpdateMyProfile).toHaveBeenCalledWith('artisan-1', {
      nomAtelier: 'Atelier AdjÃ©vi',
      ville: 'KpalimÃ©',
      pays: 'Togo',
    });
  });

  it('rejects an invalid payload (bad devise enum, 400)', async () => {
    const res = await request(app)
      .patch('/api/v1/artisan/profil')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN')
      .send({ devise: 'JPY' });
    expect(res.status).toBe(400);
  });

  it('rejects a forbidden field (mass assignment, 400)', async () => {
    const res = await request(app)
      .patch('/api/v1/artisan/profil')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN')
      .send({ estCertifie: true });
    expect(res.status).toBe(400);
  });

  it('rejects preparationMinDays > preparationMaxDays (400)', async () => {
    const res = await request(app)
      .patch('/api/v1/artisan/profil')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN')
      .send({ preparationMinDays: 6, preparationMaxDays: 2 });
    expect(res.status).toBe(400);
  });

  it('rejects an empty body (400)', async () => {
    const res = await request(app)
      .patch('/api/v1/artisan/profil')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN')
      .send({});
    expect(res.status).toBe(400);
  });

  it('accepts langue codes fr/en and rejects free text', async () => {
    const res = await request(app)
      .patch('/api/v1/artisan/profil')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN')
      .send({ langue: 'FranÃ§ais' });
    expect(res.status).toBe(400);
  });
});

describe('Artisan profile routes â€” photos', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uploads a photo de profil (200)', async () => {
    mockUploadPhotoProfil.mockResolvedValue({
      photoProfilUrl: 'https://cloudinary.com/p.jpg',
      photoProfilMimeType: 'image/png',
      photoProfilSize: 100,
    });
    const pngBuffer = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63fcffff3f030004fe01005f9e5d530000000049454e44ae426082',
      'hex'
    );
    const res = await request(app)
      .post('/api/v1/artisan/profil/photo')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN')
      .attach('file', pngBuffer, 'photo.png');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(mockUploadPhotoProfil).toHaveBeenCalled();
  });

  it('rejects a non-image file (400)', async () => {
    const res = await request(app)
      .post('/api/v1/artisan/profil/photo')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN')
      .attach('file', Buffer.from('not an image'), 'fichier.txt');
    expect(res.status).toBe(400);
  });

  it('deletes the photo de profil (204)', async () => {
    mockDeletePhotoProfil.mockResolvedValue({ id: ARTISAN_ID });
    const res = await request(app)
      .delete('/api/v1/artisan/profil/photo')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN');
    expect(res.status).toBe(204);
  });

  it('uploads a banniÃ¨re (200)', async () => {
    mockUploadBanniere.mockResolvedValue({
      photoBanniereUrl: 'https://cloudinary.com/b.jpg',
    });
    const pngBuffer = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63fcffff3f030004fe01005f9e5d530000000049454e44ae426082',
      'hex'
    );
    const res = await request(app)
      .post('/api/v1/artisan/profil/banniere')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN')
      .attach('file', pngBuffer, 'banniere.png');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects a wrong file field name (400)', async () => {
    const res = await request(app)
      .post('/api/v1/artisan/profil/photo')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN')
      .field('foo', 'bar');
    expect(res.status).toBe(400);
  });
});

describe('Artisan profile routes â€” photos atelier', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists atelier photos (200)', async () => {
    mockGetAtelierPhotos.mockResolvedValue([{ id: PHOTO_ID, ordre: 0 }]);
    const res = await request(app)
      .get('/api/v1/artisan/profil/atelier/photos')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN');
    expect(res.status).toBe(200);
    expect(res.body.photos).toHaveLength(1);
  });

  it('upload rejects when the limit is reached (409)', async () => {
    mockUploadAtelierPhoto.mockRejectedValue(
      new ConflictError('Maximum 3 photos pour l\'atelier')
    );
    const pngBuffer = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63fcffff3f030004fe01005f9e5d530000000049454e44ae426082',
      'hex'
    );
    const res = await request(app)
      .post('/api/v1/artisan/profil/atelier/photos')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN')
      .attach('file', pngBuffer, 'atelier.png');
    expect(res.status).toBe(409);
  });

  it('deletes an owned atelier photo (204)', async () => {
    mockDeleteAtelierPhoto.mockResolvedValue({ id: PHOTO_ID });
    const res = await request(app)
      .delete(`/api/v1/artisan/profil/atelier/photos/${PHOTO_ID}`)
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN');
    expect(res.status).toBe(204);
    expect(mockDeleteAtelierPhoto).toHaveBeenCalledWith('artisan-1', PHOTO_ID);
  });

  it('rejects an invalid photo id (400)', async () => {
    const res = await request(app)
      .delete('/api/v1/artisan/profil/atelier/photos/not-a-uuid')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN');
    expect(res.status).toBe(400);
  });

  it('reorders atelier photos (200)', async () => {
    mockReorderAtelierPhotos.mockResolvedValue([{}]);
    const res = await request(app)
      .patch('/api/v1/artisan/profil/atelier/photos/reorder')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN')
      .send({ photoIds: [PHOTO_ID] });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects a reorder payload with duplicates (400)', async () => {
    mockReorderAtelierPhotos.mockRejectedValue(
      new ValidationError('Doublon dÃ©tectÃ© dans la liste des photos')
    );
    const res = await request(app)
      .patch('/api/v1/artisan/profil/atelier/photos/reorder')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN')
      .send({ photoIds: [PHOTO_ID, PHOTO_ID] });
    expect(res.status).toBe(400);
  });
});

describe('Artisan profile routes â€” processus de crÃ©ation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists the processus (200)', async () => {
    mockGetProcessus.mockResolvedValue([{ id: ETAPE_ID, ordre: 1, legende: 'Photo' }]);
    const res = await request(app)
      .get('/api/v1/artisan/profil/processus')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN');
    expect(res.status).toBe(200);
    expect(res.body.etapes).toHaveLength(1);
  });

  it('creates an Ã©tape (201)', async () => {
    mockCreateProcessusEtape.mockResolvedValue({ id: ETAPE_ID, ordre: 1, legende: 'Photo' });
    const res = await request(app)
      .post('/api/v1/artisan/profil/processus')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN')
      .send({ ordre: 1, legende: 'SÃ©lection du bois' });
    expect(res.status).toBe(201);
    expect(mockCreateProcessusEtape).toHaveBeenCalledWith('artisan-1', {
      ordre: 1,
      legende: 'SÃ©lection du bois',
    });
  });

  it('rejects a 5th Ã©tape (409)', async () => {
    mockCreateProcessusEtape.mockRejectedValue(
      new ConflictError('Maximum 4 Ã©tapes dans le processus de crÃ©ation')
    );
    const res = await request(app)
      .post('/api/v1/artisan/profil/processus')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN')
      .send({ ordre: 1, legende: 'Trop' });
    expect(res.status).toBe(409);
  });

  it('rejects an ordre outside 1-4 (400)', async () => {
    const res = await request(app)
      .post('/api/v1/artisan/profil/processus')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN')
      .send({ ordre: 9, legende: 'Invalide' });
    expect(res.status).toBe(400);
  });

  it('rejects an empty legende (400)', async () => {
    const res = await request(app)
      .post('/api/v1/artisan/profil/processus')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN')
      .send({ ordre: 1, legende: '' });
    expect(res.status).toBe(400);
  });

  it('404 on updating another artisan Ã©tape', async () => {
    mockUpdateProcessusEtape.mockRejectedValue(new NotFoundError('Ã‰tape du processus non trouvÃ©e'));
    const res = await request(app)
      .patch(`/api/v1/artisan/profil/processus/${ETAPE_ID}`)
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN')
      .send({ legende: 'X' });
    expect(res.status).toBe(404);
  });

  it('deletes an owned Ã©tape (204)', async () => {
    mockDeleteProcessusEtape.mockResolvedValue({ id: ETAPE_ID });
    const res = await request(app)
      .delete(`/api/v1/artisan/profil/processus/${ETAPE_ID}`)
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN');
    expect(res.status).toBe(204);
  });

  it('reorders the processus (200)', async () => {
    mockReorderProcessus.mockResolvedValue([{}]);
    const res = await request(app)
      .patch('/api/v1/artisan/profil/processus/reorder')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN')
      .send({ etapeIds: [ETAPE_ID] });
    expect(res.status).toBe(200);
  });

  it('uploads a photo to an owned Ã©tape (200)', async () => {
    mockUploadProcessusPhoto.mockResolvedValue({
      id: ETAPE_ID,
      photoUrl: 'https://cloudinary.com/p.jpg',
    });
    const pngBuffer = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63fcffff3f030004fe01005f9e5d530000000049454e44ae426082',
      'hex'
    );
    const res = await request(app)
      .post(`/api/v1/artisan/profil/processus/${ETAPE_ID}/photo`)
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN')
      .attach('file', pngBuffer, 'etape.png');
    expect(res.status).toBe(200);
    expect(mockUploadProcessusPhoto).toHaveBeenCalled();
  });
});

describe('Artisan profile routes â€” expositions', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists expositions (200)', async () => {
    mockGetExpositions.mockResolvedValue([{ id: EXP_ID, annee: 2025, evenement: 'Dakâ€™Art' }]);
    const res = await request(app)
      .get('/api/v1/artisan/profil/expositions')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN');
    expect(res.status).toBe(200);
    expect(res.body.expositions).toHaveLength(1);
  });

  it('creates an exposition (201)', async () => {
    mockCreateExposition.mockResolvedValue({ id: EXP_ID, annee: 2025 });
    const res = await request(app)
      .post('/api/v1/artisan/profil/expositions')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN')
      .send({ annee: 2025, evenement: 'Dakâ€™Art â€” Biennale de Dakar', lieu: 'SÃ©nÃ©gal' });
    expect(res.status).toBe(201);
    expect(mockCreateExposition).toHaveBeenCalledWith('artisan-1', {
      annee: 2025,
      evenement: 'Dakâ€™Art â€” Biennale de Dakar',
      lieu: 'SÃ©nÃ©gal',
    });
  });

  it('rejects an unrealistic annÃ©e (400)', async () => {
    const res = await request(app)
      .post('/api/v1/artisan/profil/expositions')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN')
      .send({ annee: 1400, evenement: 'X', lieu: 'Y' });
    expect(res.status).toBe(400);
  });

  it('rejects an empty evenement (400)', async () => {
    const res = await request(app)
      .post('/api/v1/artisan/profil/expositions')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN')
      .send({ annee: 2025, evenement: '', lieu: 'LomÃ©' });
    expect(res.status).toBe(400);
  });

  it('404 updating another artisan exposition', async () => {
    mockUpdateExposition.mockRejectedValue(new NotFoundError('Exposition non trouvÃ©e'));
    const res = await request(app)
      .patch(`/api/v1/artisan/profil/expositions/${EXP_ID}`)
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN')
      .send({ lieu: 'LomÃ©' });
    expect(res.status).toBe(404);
  });

  it('deletes an owned exposition (204)', async () => {
    mockDeleteExposition.mockResolvedValue({ id: EXP_ID });
    const res = await request(app)
      .delete(`/api/v1/artisan/profil/expositions/${EXP_ID}`)
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN');
    expect(res.status).toBe(204);
  });

  it('rejects an invalid exposition id (400)', async () => {
    const res = await request(app)
      .delete('/api/v1/artisan/profil/expositions/not-a-uuid')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN');
    expect(res.status).toBe(400);
  });
});

describe('Artisan profile routes â€” versements (privÃ©)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('updates Mobile Money preference (200)', async () => {
    mockUpdateVersement.mockResolvedValue({
      methode: 'MOBILE_MONEY',
      mobileMoneyOperateur: 'Moov Money',
      mobileMoneyNumero: '+22890123456',
    });
    const res = await request(app)
      .patch('/api/v1/artisan/profil/versement')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN')
      .send({
        methode: 'MOBILE_MONEY',
        mobileMoneyOperateur: 'Moov Money',
        mobileMoneyNumero: '+22890123456',
      });
    expect(res.status).toBe(200);
    expect(res.body.preference.methode).toBe('MOBILE_MONEY');
  });

  it('accepts bank transfer preference (200)', async () => {
    mockUpdateVersement.mockResolvedValue({
      methode: 'VIREMENT_BANCAIRE',
      virementNomBanque: 'Banque Atlantique',
    });
    const res = await request(app)
      .patch('/api/v1/artisan/profil/versement')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN')
      .send({
        methode: 'VIREMENT_BANCAIRE',
        virementNomBanque: 'Banque Atlantique',
      });
    expect(res.status).toBe(200);
  });

  it('rejects an invalid methode (400)', async () => {
    const res = await request(app)
      .patch('/api/v1/artisan/profil/versement')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN')
      .send({ methode: 'PAYPAL' });
    expect(res.status).toBe(400);
  });

  it('rejects Mobile Money without operatore/numero (400)', async () => {
    const res = await request(app)
      .patch('/api/v1/artisan/profil/versement')
      .set('Authorization', 'Bearer token')
      .set('x-test-role', 'ARTISAN')
      .send({ methode: 'MOBILE_MONEY' });
    expect(res.status).toBe(400);
  });
});
