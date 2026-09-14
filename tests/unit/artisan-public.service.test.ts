import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ArtisanPublicService } from '../../src/modules/artisans/artisan-public.service.js';
import { NotFoundError } from '../../src/common/errors/AppError.js';

const ARTISAN_ID = '123e4567-e89b-12d3-a456-426614174111';

function buildService(overrides = {}) {
  const repository = {
    findPublicArtisans: vi.fn(),
    findPublicArtisanById: vi.fn(),
    countPublishedOeuvres: vi.fn(),
    findPublishedOeuvresByArtisan: vi.fn(),
    ...overrides,
  } as any;
  const service = new ArtisanPublicService(repository);
  return { service, repository };
}

const listItem = {
  id: ARTISAN_ID,
  type: 'ARTISAN',
  nomAtelier: 'Atelier Adjévi',
  specialite: 'Sculpture',
  localisation: 'Lomé',
  anneesExperience: 5,
  estCertifie: true,
  photoProfilUrl: 'https://cdn.example.com/profil.jpg',
  ville: 'Lomé',
  pays: 'Togo',
  bioCourte: 'Artisan du bois',
  anneeCreation: 2019,
  user: { nom: 'Koffi A.' },
};

const profileRow = {
  ...listItem,
  biographie: 'Créateur passionné',
  photoBanniereUrl: 'https://cdn.example.com/banniere.jpg',
  histoire: 'Mon histoire',
  siteWeb: 'https://example.com',
  liensReseauxSociaux: {
    instagram: '@atelier',
    facebook: 'fb',
    whatsapp: '+22890',
    emailPrive: 'prive@example.com',
  },
  createdAt: new Date('2024-01-01'),
  atelierPhotos: [{ id: 'p1', url: 'https://cdn.example.com/a1.jpg', ordre: 0 }],
  processusEtapes: [{ id: 'e1', ordre: 1, photoUrl: null, legende: 'Étape 1' }],
  expositions: [{ id: 'x1', annee: 2023, evenement: 'Salon', lieu: 'Lomé' }],
};

const oeuvreRow = {
  id: '123e4567-e89b-12d3-a456-426614174300',
  titre: 'Sculpture Totem',
  description: 'Une sculpture',
  technique: 'Bois',
  anneeCreation: 2024,
  prixXOF: 50000,
  statut: 'PUBLIEE',
  disponibilite: 'DISPONIBLE',
  createdAt: new Date('2024-01-01'),
  medias: [{ url: 'https://cdn.example.com/o1.jpg', mimeType: 'image/jpeg', ordre: 0 }],
  categorie: { id: 'c1', nom: 'Sculpture', slug: 'sculpture' },
};

describe('ArtisanPublicService — liste', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retourne une liste vide proprement', async () => {
    const { service, repository } = buildService();
    repository.findPublicArtisans.mockResolvedValue({ artisans: [], total: 0 });

    const result = await service.getPublicArtisans(1, 20, {}, 'recent');

    expect(result.artisans).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(result.page).toBe(1);
    expect(result.limit).toBe(20);
  });

  it('retourne une liste paginée avec le total', async () => {
    const { service, repository } = buildService();
    repository.findPublicArtisans.mockResolvedValue({ artisans: [listItem], total: 7 });

    const result = await service.getPublicArtisans(2, 10, {}, 'recent');

    expect(result.artisans).toHaveLength(1);
    expect(result.total).toBe(7);
    expect(repository.findPublicArtisans).toHaveBeenCalledWith(2, 10, {}, 'recent');
  });

  it('transmet la recherche et les filtres au repository', async () => {
    const { service, repository } = buildService();
    repository.findPublicArtisans.mockResolvedValue({ artisans: [], total: 0 });

    await service.getPublicArtisans(1, 20, { q: 'bois', pays: 'Togo' }, 'name_asc');

    expect(repository.findPublicArtisans).toHaveBeenCalledWith(
      1,
      20,
      { q: 'bois', pays: 'Togo' },
      'name_asc'
    );
  });

  it('expose uniquement des champs publics dans la liste', async () => {
    const { service, repository } = buildService();
    const fullRow = {
      ...listItem,
      devise: 'XOF',
      langue: 'fr',
      preparationMinDays: 2,
      preparationMaxDays: 5,
      photoProfilPublicId: 'secret-public-id',
      paiementPreference: { virementIban: 'FR00' },
    };
    repository.findPublicArtisans.mockResolvedValue({ artisans: [fullRow], total: 1 });

    const result = await service.getPublicArtisans(1, 20, {}, 'recent');
    const item = result.artisans[0];

    expect(item).not.toHaveProperty('paiementPreference');
    expect(item).not.toHaveProperty('photoProfilPublicId');
    expect(item).not.toHaveProperty('devise');
    expect(item).not.toHaveProperty('langue');
    expect(JSON.stringify(item)).not.toContain('FR00');
    expect(JSON.stringify(item)).not.toContain('secret-public-id');
  });
});

describe('ArtisanPublicService — profil public', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retourne le profil public construit avec les statistiques', async () => {
    const { service, repository } = buildService();
    repository.findPublicArtisanById.mockResolvedValue(profileRow);
    repository.countPublishedOeuvres.mockResolvedValue(4);

    const result = await service.getPublicArtisan(ARTISAN_ID);

    expect(result.id).toBe(ARTISAN_ID);
    expect(result.nom).toBe('Koffi A.');
    expect(result.statistiques).toEqual({ nombreOeuvres: 4 });
    expect(result.atelierPhotos).toHaveLength(1);
    expect(result.processus).toHaveLength(1);
    expect(result.expositions).toHaveLength(1);
    expect(repository.countPublishedOeuvres).toHaveBeenCalledWith(ARTISAN_ID);
  });

  it('ne construit les réseaux sociaux que sur les clés publiques (insta/facebook/whatsapp)', async () => {
    const { service, repository } = buildService();
    repository.findPublicArtisanById.mockResolvedValue(profileRow);
    repository.countPublishedOeuvres.mockResolvedValue(0);

    const result = await service.getPublicArtisan(ARTISAN_ID);

    expect(result.reseauxSociaux).toEqual({
      instagram: '@atelier',
      facebook: 'fb',
      whatsapp: '+22890',
    });
    expect(result.reseauxSociaux).not.toHaveProperty('emailPrive');
  });

  it('n\'expose jamais les données privées dans le profil', async () => {
    const { service, repository } = buildService();
    const leakyRow = {
      ...profileRow,
      user: { nom: 'Koffi A.', email: 'privé@example.com', telephone: '+22890000000' },
      photoProfilPublicId: 'public-id-secret',
      photoBannierePublicId: 'banniere-id-secret',
      photoProfilMimeType: 'image/jpeg',
      photoProfilSize: 1024,
      paiementPreference: { virementIban: 'FR00123', mobileMoneyNumero: '+2289000' },
      boutiqueSetting: { devise: 'EUR' },
      validatedAt: new Date(),
    };
    repository.findPublicArtisanById.mockResolvedValue(leakyRow);
    repository.countPublishedOeuvres.mockResolvedValue(0);

    const result = await service.getPublicArtisan(ARTISAN_ID);
    const json = JSON.stringify(result);

    expect(json).not.toContain('privé@example.com');
    expect(json).not.toContain('+22890000000');
    expect(json).not.toContain('FR00123');
    expect(json).not.toContain('+2289000');
    expect(json).not.toContain('public-id-secret');
    expect(json).not.toContain('banniere-id-secret');
    expect(json).not.toContain('photoProfilMimeType');
    expect(result).not.toHaveProperty('valide');
    expect(result).not.toHaveProperty('paiementPreference');
    expect(result).not.toHaveProperty('boutiqueSetting');
  });

  it('lève une NotFoundError quand l\'artisan n\'existe pas', async () => {
    const { service, repository } = buildService();
    repository.findPublicArtisanById.mockResolvedValue(null);

    await expect(service.getPublicArtisan(ARTISAN_ID)).rejects.toThrow(NotFoundError);
    expect(repository.countPublishedOeuvres).not.toHaveBeenCalled();
  });
});

describe('ArtisanPublicService — œuvres publiques', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retourne les œuvres publiques d\'un artisan existant', async () => {
    const { service, repository } = buildService();
    repository.findPublicArtisanById.mockResolvedValue(profileRow);
    repository.findPublishedOeuvresByArtisan.mockResolvedValue({
      oeuvres: [oeuvreRow],
      total: 1,
    });

    const result = await service.getPublicArtisanOeuvres(ARTISAN_ID, 1, 20);

    expect(result.oeuvres).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(repository.findPublishedOeuvresByArtisan).toHaveBeenCalledWith(ARTISAN_ID, 1, 20);
  });

  it('retourne une liste vide quand l\'artisan n\'a aucune œuvre publique', async () => {
    const { service, repository } = buildService();
    repository.findPublicArtisanById.mockResolvedValue(profileRow);
    repository.findPublishedOeuvresByArtisan.mockResolvedValue({ oeuvres: [], total: 0 });

    const result = await service.getPublicArtisanOeuvres(ARTISAN_ID, 1, 20);
    expect(result.oeuvres).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('lève NotFoundError si l\'artisan n\'existe pas', async () => {
    const { service, repository } = buildService();
    repository.findPublicArtisanById.mockResolvedValue(null);

    await expect(service.getPublicArtisanOeuvres(ARTISAN_ID, 1, 20)).rejects.toThrow(
      NotFoundError
    );
    expect(repository.findPublishedOeuvresByArtisan).not.toHaveBeenCalled();
  });
});