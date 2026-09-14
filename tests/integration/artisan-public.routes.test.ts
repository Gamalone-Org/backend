import { beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { NotFoundError } from '../../src/common/errors/AppError.js';

const mockList = vi.fn();
const mockGetProfile = vi.fn();
const mockListOeuvres = vi.fn();

vi.mock('../../src/modules/artisans/artisan-public.service.js', () => ({
  ArtisanPublicService: class {
    getPublicArtisans = mockList;
    getPublicArtisan = mockGetProfile;
    getPublicArtisanOeuvres = mockListOeuvres;
  },
}));

vi.mock('../../src/modules/marketplace/oeuvre.service.js', () => ({
  OeuvreService: class {
    createOeuvre = vi.fn();
    getMyOeuvres = vi.fn();
    getMyOeuvre = vi.fn();
    updateOeuvre = vi.fn();
    deleteOeuvre = vi.fn();
    submitForValidation = vi.fn();
    withdrawOeuvre = vi.fn();
    getPendingValidation = vi.fn();
    getAllAdmin = vi.fn();
    getOeuvreAdmin = vi.fn();
    approveOeuvre = vi.fn();
    rejectOeuvre = vi.fn();
    withdrawOeuvreAdmin = vi.fn();
    getPublishedPublic = vi.fn();
    getFeatured = vi.fn();
    getOeuvrePublic = vi.fn();
  },
}));

vi.mock('../../src/modules/marketplace/media.service.js', () => ({
  MediaService: class {
    uploadMedia = vi.fn();
    deleteMedia = vi.fn();
    reorderMedias = vi.fn();
  },
}));

vi.mock('../../src/shared/services/cloudinary/index.js', () => ({
  CloudinaryService: class {
    uploadDocument = vi.fn();
    uploadImage = vi.fn();
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

const app = (await import('../../src/app.js')).default;

const ARTISAN_ID = '123e4567-e89b-12d3-a456-426614174111';

const publicArtisan = {
  id: ARTISAN_ID,
  nom: 'Koffi A.',
  nomAtelier: 'Atelier Adjévi',
  type: 'ARTISAN',
  specialite: 'Sculpture',
  localisation: 'Lomé',
  anneesExperience: 5,
  estCertifie: true,
  photoProfilUrl: 'https://cdn.example.com/profil.jpg',
  ville: 'Lomé',
  pays: 'Togo',
  bioCourte: 'Artisan du bois',
  anneeCreation: 2019,
};

const publicProfile = {
  ...publicArtisan,
  biographie: 'Créateur passionné',
  photoBanniereUrl: 'https://cdn.example.com/banniere.jpg',
  histoire: 'Mon histoire',
  siteWeb: 'https://example.com',
  reseauxSociaux: { instagram: '@atelier', facebook: 'fb', whatsapp: '+22890' },
  atelierPhotos: [{ id: 'p1', url: 'https://cdn.example.com/a1.jpg', ordre: 0 }],
  processus: [{ id: 'e1', ordre: 1, photoUrl: null, legende: 'Étape 1' }],
  expositions: [{ id: 'x1', annee: 2023, evenement: 'Salon', lieu: 'Lomé' }],
  statistiques: { nombreOeuvres: 4 },
  createdAt: new Date('2024-01-01'),
};

const publicOeuvre = {
  id: '123e4567-e89b-12d3-a456-426614174300',
  titre: 'Sculpture Totem',
  statut: 'PUBLIEE',
  prixXOF: 50000,
  medias: [],
};

describe('Artisan public routes — liste', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockList.mockResolvedValue({
      artisans: [publicArtisan],
      total: 1,
      page: 1,
      limit: 20,
    });
  });

  it('GET /api/v1/artisans est accessible sans token (200)', async () => {
    const res = await request(app).get('/api/v1/artisans');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.artisans).toHaveLength(1);
    expect(res.body.total).toBe(1);
  });

  it('GET /api/v1/artisans propage la pagination, la recherche, les filtres et le tri', async () => {
    await request(app).get(
      '/api/v1/artisans?page=2&limit=10&q=bois&pays=Togo&ville=Lom%C3%A9&specialite=Sculpture&tri=name_asc'
    );
    expect(mockList).toHaveBeenCalledWith(2, 10, {
      q: 'bois',
      pays: 'Togo',
      ville: 'Lomé',
      specialite: 'Sculpture',
    }, 'name_asc');
  });

  it('GET /api/v1/artisans rejette les paramètres invalides (400)', async () => {
    const res = await request(app).get('/api/v1/artisans?limit=500');
    expect(res.status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });

  it('GET /api/v1/artisans rejette un tri inconnu (400)', async () => {
    const res = await request(app).get('/api/v1/artisans?tri=popularite');
    expect(res.status).toBe(400);
    expect(mockList).not.toHaveBeenCalled();
  });
});

describe('Artisan public routes — profil', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetProfile.mockResolvedValue(publicProfile);
  });

  it('GET /api/v1/artisans/:identifier retourne le profil public (200)', async () => {
    const res = await request(app).get(`/api/v1/artisans/${ARTISAN_ID}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.artisan.nomAtelier).toBe('Atelier Adjévi');
    expect(mockGetProfile).toHaveBeenCalledWith(ARTISAN_ID);
  });

  it('GET /api/v1/artisans/:identifier lève 404 pour un artisan inexistant', async () => {
    mockGetProfile.mockRejectedValueOnce(new NotFoundError('Artisan non trouve'));
    const res = await request(app).get(`/api/v1/artisans/${ARTISAN_ID}`);
    expect(res.status).toBe(404);
  });

  it('GET /api/v1/artisans/:identifier rejette un identifiant non UUID (400)', async () => {
    const res = await request(app).get('/api/v1/artisans/not-a-uuid');
    expect(res.status).toBe(400);
    expect(mockGetProfile).not.toHaveBeenCalled();
  });
});

describe('Artisan public routes — œuvres', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockListOeuvres.mockResolvedValue({
      oeuvres: [publicOeuvre],
      total: 1,
      page: 1,
      limit: 20,
    });
  });

  it('GET /api/v1/artisans/:identifier/oeuvres retourne les œuvres publiques (200)', async () => {
    const res = await request(app).get(`/api/v1/artisans/${ARTISAN_ID}/oeuvres`);
    expect(res.status).toBe(200);
    expect(res.body.oeuvres).toHaveLength(1);
    expect(mockListOeuvres).toHaveBeenCalledWith(ARTISAN_ID, 1, 20);
  });

  it('GET /api/v1/artisans/:identifier/oeuvres propage la pagination', async () => {
    const res = await request(app).get(`/api/v1/artisans/${ARTISAN_ID}/oeuvres?page=2&limit=10`);
    expect(res.status).toBe(200);
    expect(mockListOeuvres).toHaveBeenCalledWith(ARTISAN_ID, 2, 10);
  });

  it('GET /api/v1/artisans/:identifier/oeuvres lève 404 pour un artisan inexistant', async () => {
    mockListOeuvres.mockRejectedValueOnce(new NotFoundError('Artisan non trouve'));
    const res = await request(app).get(`/api/v1/artisans/${ARTISAN_ID}/oeuvres`);
    expect(res.status).toBe(404);
  });

  it('GET /api/v1/artisans/:identifier/oeuvres rejette un identifiant invalide (400)', async () => {
    const res = await request(app).get('/api/v1/artisans/not-a-uuid/oeuvres');
    expect(res.status).toBe(400);
  });
});

describe('Artisan public routes — confidentialité', () => {
  it('les réponses ne contiennent jamais de données privées', async () => {
    mockGetProfile.mockResolvedValue(publicProfile);
    mockList.mockResolvedValue({ artisans: [publicArtisan], total: 1, page: 1, limit: 20 });

    const profileRes = await request(app).get(`/api/v1/artisans/${ARTISAN_ID}`);
    const listRes = await request(app).get('/api/v1/artisans');

    const profileJson = JSON.stringify(profileRes.body);
    const listJson = JSON.stringify(listRes.body);

    for (const secret of [
      'paiementPreference',
      'virementIban',
      'iban',
      'mobileMoneyNumero',
      'telephone',
      'email',
      'motDePasse',
      'password',
      'photoProfilPublicId',
      'photoBannierePublicId',
      'publicId',
    ]) {
      expect(profileJson).not.toContain(secret);
      expect(listJson).not.toContain(secret);
    }
  });
});