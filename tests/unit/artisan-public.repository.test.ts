import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ArtisanPublicRepository } from '../../src/modules/artisans/artisan-public.repository.js';

const ARTISAN_ID = '123e4567-e89b-12d3-a456-426614174111';
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function buildRepository(overrides = {}) {
  const prisma = {
    artisanProfile: {
      findMany: vi.fn(),
      count: vi.fn(),
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
    oeuvre: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
    ...overrides.prisma,
  } as any;

  const repository = new ArtisanPublicRepository(prisma as any) as any;

  return { repository, prisma };
}

const publicArtisanRow = {
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
  createdAt: new Date('2024-01-01'),
};

const publicProfileRow = {
  ...publicArtisanRow,
  biographie: 'Créateur passionné',
  photoBanniereUrl: 'https://cdn.example.com/banniere.jpg',
  histoire: 'Mon histoire',
  siteWeb: 'https://example.com',
  liensReseauxSociaux: { instagram: '@atelier', facebook: 'fb', whatsapp: '+22890' },
  atelierPhotos: [{ id: 'p1', url: 'https://cdn.example.com/a1.jpg', ordre: 0 }],
  processusEtapes: [{ id: 'e1', ordre: 1, photoUrl: null, legende: 'Étape 1' }],
  expositions: [{ id: 'x1', annee: 2023, evenement: 'Salon', lieu: 'Lomé' }],
};

const publicOeuvreRow = {
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

describe('ArtisanPublicRepository — liste publique', () => {
  beforeEach(() => vi.clearAllMocks());

  it('applique le filtre de visibilité (user ACTIF/ARTISAN, validatedAt) et la pagination', async () => {
    const { repository, prisma } = buildRepository();
    prisma.artisanProfile.findMany.mockResolvedValue([publicArtisanRow]);
    prisma.artisanProfile.count.mockResolvedValue(1);

    const result = await repository.findPublicArtisans(
      1,
      20,
      { q: undefined, pays: undefined, ville: undefined, specialite: undefined },
      'recent'
    );

    expect(result.artisans).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(prisma.artisanProfile.findMany).toHaveBeenCalledWith({
      where: expect.objectContaining({
        user: { statut: 'ACTIF', role: 'ARTISAN', deletedAt: null },
        validatedAt: { not: null },
      }),
      select: expect.any(Object),
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 20,
    });
    expect(prisma.artisanProfile.count).toHaveBeenCalledWith({
      where: expect.objectContaining({
        user: { statut: 'ACTIF', role: 'ARTISAN', deletedAt: null },
        validatedAt: { not: null },
      }),
    });
  });

  it('construit une recherche OR sur nomAtelier, specialite, localisation et user.nom', async () => {
    const { repository, prisma } = buildRepository();
    prisma.artisanProfile.findMany.mockResolvedValue([]);
    prisma.artisanProfile.count.mockResolvedValue(0);

    await repository.findPublicArtisans(1, 20, { q: 'bois', pays: undefined, ville: undefined, specialite: undefined }, 'recent');

    expect(prisma.artisanProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [
            { nomAtelier: { contains: 'bois', mode: 'insensitive' } },
            { specialite: { contains: 'bois', mode: 'insensitive' } },
            { localisation: { contains: 'bois', mode: 'insensitive' } },
            { user: { nom: { contains: 'bois', mode: 'insensitive' } } },
          ],
        }),
      })
    );
  });

  it('combine les filtres pays, ville et specialite', async () => {
    const { repository, prisma } = buildRepository();
    prisma.artisanProfile.findMany.mockResolvedValue([]);
    prisma.artisanProfile.count.mockResolvedValue(0);

    await repository.findPublicArtisans(2, 10, { q: undefined, pays: 'Togo', ville: 'Lomé', specialite: 'Sculpture' }, 'name_asc');

    expect(prisma.artisanProfile.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          pays: { contains: 'Togo', mode: 'insensitive' },
          ville: { contains: 'Lomé', mode: 'insensitive' },
          specialite: { contains: 'Sculpture', mode: 'insensitive' },
        }),
        orderBy: { nomAtelier: 'asc' },
        skip: 10,
        take: 10,
      })
    );
  });

  it('n\'utilise pas de select global (SELECT explicite minimal)', async () => {
    const { repository, prisma } = buildRepository();
    prisma.artisanProfile.findMany.mockResolvedValue([]);
    prisma.artisanProfile.count.mockResolvedValue(0);

    await repository.findPublicArtisans(1, 20, {}, 'recent');

    const callArgs = prisma.artisanProfile.findMany.mock.calls[0]?.[0];
    expect(callArgs.select).toBeDefined();
    expect(callArgs.select.email).toBeUndefined();
    expect(callArgs.select.telephone).toBeUndefined();
    expect(callArgs.select.paiementPreference).toBeUndefined();
  });
});

describe('ArtisanPublicRepository — profil public', () => {
  beforeEach(() => vi.clearAllMocks());

  it('retourne le profil public d\'un artisan visible et son nombre d\'œuvres', async () => {
    const { repository, prisma } = buildRepository();
    prisma.artisanProfile.findFirst.mockResolvedValue(publicProfileRow);
    prisma.oeuvre.count.mockResolvedValue(3);

    const profile = await repository.findPublicArtisanById(ARTISAN_ID);
    const count = await repository.countPublishedOeuvres(ARTISAN_ID);

    expect(profile).toEqual(publicProfileRow);
    expect(count).toBe(3);
    expect(prisma.artisanProfile.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({ id: ARTISAN_ID }),
      select: expect.any(Object),
    });
    expect(prisma.oeuvre.count).toHaveBeenCalledWith({
      where: { artisanId: ARTISAN_ID, statut: 'PUBLIEE' },
    });
  });

  it('retourne null quand l\'artisan n\'existe pas ou n\'est pas visible', async () => {
    const { repository, prisma } = buildRepository();
    prisma.artisanProfile.findFirst.mockResolvedValue(null);

    const result = await repository.findPublicArtisanById(ARTISAN_ID);
    expect(result).toBeNull();
  });
});

describe('ArtisanPublicRepository — œuvres publiques', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ne retourne que les œuvres PUBLIEE avec pagination', async () => {
    const { repository, prisma } = buildRepository();
    prisma.oeuvre.findMany.mockResolvedValue([publicOeuvreRow]);
    prisma.oeuvre.count.mockResolvedValue(1);

    const result = await repository.findPublishedOeuvresByArtisan(ARTISAN_ID, 1, 20);

    expect(result.oeuvres).toHaveLength(1);
    expect(result.total).toBe(1);
    expect(prisma.oeuvre.findMany).toHaveBeenCalledWith({
      where: { artisanId: ARTISAN_ID, statut: 'PUBLIEE' },
      orderBy: { createdAt: 'desc' },
      skip: 0,
      take: 20,
      select: expect.any(Object),
    });
  });

  it('retourne une liste vide si aucun œuvres', async () => {
    const { repository, prisma } = buildRepository();
    prisma.oeuvre.findMany.mockResolvedValue([]);
    prisma.oeuvre.count.mockResolvedValue(0);

    const result = await repository.findPublishedOeuvresByArtisan(ARTISAN_ID, 1, 20);
    expect(result.oeuvres).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});