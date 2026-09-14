import type { Prisma, PrismaClient, ArtisanProfile } from '../../generated/prisma/client.js';
import type { ListArtisansQuery } from './artisan-public.schema.js';

// ---------------------------------------------------------------------------
// Public artisan list select
// ---------------------------------------------------------------------------

export type PublicArtisanListSelect = {
  id: true;
  type: true;
  nomAtelier: true;
  specialite: true;
  localisation: true;
  anneesExperience: true;
  estCertifie: true;
  photoProfilUrl: true;
  ville: true;
  pays: true;
  bioCourte: true;
  anneeCreation: true;
  user: { select: { nom: true } };
};

// ---------------------------------------------------------------------------
// Public artisan profile select
// ---------------------------------------------------------------------------

export type PublicArtisanProfileSelect = {
  id: true;
  type: true;
  nomAtelier: true;
  specialite: true;
  biographie: true;
  localisation: true;
  anneesExperience: true;
  estCertifie: true;
  photoProfilUrl: true;
  photoBanniereUrl: true;
  anneeCreation: true;
  ville: true;
  pays: true;
  bioCourte: true;
  histoire: true;
  siteWeb: true;
  liensReseauxSociaux: true;
  createdAt: true;
  user: { select: { nom: true } };
  atelierPhotos: {
    select: { id: true; url: true; ordre: true };
    orderBy: { ordre: 'asc' };
  };
  processusEtapes: {
    select: { id: true; ordre: true; photoUrl: true; legende: true };
    orderBy: { ordre: 'asc' };
  };
  expositions: {
    select: { id: true; annee: true; evenement: true; lieu: true };
    orderBy: [{ annee: 'desc' }, { createdAt: 'desc' }];
  };
};

// ---------------------------------------------------------------------------
// Public artisan oeuvre select
// ---------------------------------------------------------------------------

export type PublicArtisanOeuvreSelect = {
  id: true;
  titre: true;
  description: true;
  technique: true;
  anneeCreation: true;
  prixXOF: true;
  statut: true;
  disponibilite: true;
  createdAt: true;
  medias: {
    select: { url: true; mimeType: true; ordre: true };
    orderBy: { ordre: 'asc' };
    take: 1;
  };
  categorie: { select: { id: true; nom: true; slug: true } };
};

// ---------------------------------------------------------------------------
// Select shape instances
// ---------------------------------------------------------------------------

const LIST_SELECT: PublicArtisanListSelect = {
  id: true,
  type: true,
  nomAtelier: true,
  specialite: true,
  localisation: true,
  anneesExperience: true,
  estCertifie: true,
  photoProfilUrl: true,
  ville: true,
  pays: true,
  bioCourte: true,
  anneeCreation: true,
  user: { select: { nom: true } },
};

const PROFILE_SELECT: PublicArtisanProfileSelect = {
  id: true,
  type: true,
  nomAtelier: true,
  specialite: true,
  biographie: true,
  localisation: true,
  anneesExperience: true,
  estCertifie: true,
  photoProfilUrl: true,
  photoBanniereUrl: true,
  anneeCreation: true,
  ville: true,
  pays: true,
  bioCourte: true,
  histoire: true,
  siteWeb: true,
  liensReseauxSociaux: true,
  createdAt: true,
  user: { select: { nom: true } },
  atelierPhotos: {
    select: { id: true, url: true, ordre: true },
    orderBy: { ordre: 'asc' },
  },
  processusEtapes: {
    select: { id: true, ordre: true, photoUrl: true, legende: true },
    orderBy: { ordre: 'asc' },
  },
  expositions: {
    select: { id: true, annee: true, evenement: true, lieu: true },
    orderBy: [{ annee: 'desc' }, { createdAt: 'desc' }],
  },
};

const OEUVRE_SELECT: PublicArtisanOeuvreSelect = {
  id: true,
  titre: true,
  description: true,
  technique: true,
  anneeCreation: true,
  prixXOF: true,
  statut: true,
  disponibilite: true,
  createdAt: true,
  medias: {
    select: { url: true, mimeType: true, ordre: true },
    orderBy: { ordre: 'asc' },
    take: 1,
  },
  categorie: { select: { id: true, nom: true, slug: true } },
};

// ---------------------------------------------------------------------------
// Public item result types (derived from the select shapes)
// ---------------------------------------------------------------------------

type PublicArtisanListItem = {
  id: string;
  type: ArtisanProfile['type'];
  nomAtelier: string;
  specialite: string;
  localisation: string;
  anneesExperience: number;
  estCertifie: boolean;
  photoProfilUrl: string | null;
  ville: string | null;
  pays: string | null;
  bioCourte: string | null;
  anneeCreation: number | null;
  user: { nom: string | null };
};

type PublicArtisanProfile = {
  id: string;
  type: ArtisanProfile['type'];
  nomAtelier: string;
  specialite: string;
  biographie: string;
  localisation: string;
  anneesExperience: number;
  estCertifie: boolean;
  photoProfilUrl: string | null;
  photoBanniereUrl: string | null;
  anneeCreation: number | null;
  ville: string | null;
  pays: string | null;
  bioCourte: string | null;
  histoire: string | null;
  siteWeb: string | null;
  liensReseauxSociaux: unknown;
  createdAt: Date;
  user: { nom: string | null };
  atelierPhotos: { id: string; url: string; ordre: number }[];
  processusEtapes: {
    id: string;
    ordre: number;
    photoUrl: string | null;
    legende: string;
  }[];
  expositions: {
    id: string;
    annee: number;
    evenement: string;
    lieu: string;
  }[];
};

type PublicArtisanOeuvre = {
  id: string;
  titre: string;
  description: string;
  technique: string;
  anneeCreation: number;
  prixXOF: unknown;
  statut: string;
  disponibilite: string;
  createdAt: Date;
  medias: { url: string; mimeType: string; ordre: number }[];
  categorie: { id: string; nom: string; slug: string } | null;
};

// ---------------------------------------------------------------------------
// Repository
// ---------------------------------------------------------------------------

export class ArtisanPublicRepository {
  constructor(private readonly prisma: PrismaClient) {}

  // ---------------------------------------------------------------------------
  // Visibility filter — artisans publicly visible
  // ---------------------------------------------------------------------------
  private get publicVisibilityWhere(): Prisma.ArtisanProfileWhereInput {
    return {
      user: {
        statut: 'ACTIF',
        role: 'ARTISAN',
        deletedAt: null,
      },
      validatedAt: { not: null },
    };
  }

  // ---------------------------------------------------------------------------
  // List public artisans
  // ---------------------------------------------------------------------------

  async findPublicArtisans(
    page: number,
    limit: number,
    filters: Pick<ListArtisansQuery, 'q' | 'pays' | 'ville' | 'specialite'>,
    tri: ListArtisansQuery['tri']
  ): Promise<{ artisans: PublicArtisanListItem[]; total: number }> {
    const where: Prisma.ArtisanProfileWhereInput = { ...this.publicVisibilityWhere };

    if (filters.q) {
      where.OR = [
        { nomAtelier: { contains: filters.q, mode: 'insensitive' } },
        { specialite: { contains: filters.q, mode: 'insensitive' } },
        { localisation: { contains: filters.q, mode: 'insensitive' } },
        { user: { nom: { contains: filters.q, mode: 'insensitive' } } },
      ];
    }
    if (filters.pays) {
      where.pays = { contains: filters.pays, mode: 'insensitive' };
    }
    if (filters.ville) {
      where.ville = { contains: filters.ville, mode: 'insensitive' };
    }
    if (filters.specialite) {
      where.specialite = { contains: filters.specialite, mode: 'insensitive' };
    }

    const orderBy = this.buildOrderBy(tri);

    const [artisans, total] = await Promise.all([
      this.prisma.artisanProfile.findMany({
        where,
        select: LIST_SELECT,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
      }) as unknown as Promise<PublicArtisanListItem[]>,
      this.prisma.artisanProfile.count({ where }),
    ]);

    return { artisans, total };
  }

  // ---------------------------------------------------------------------------
  // Find public artisan profile by ID
  // ---------------------------------------------------------------------------

  async findPublicArtisanById(id: string): Promise<PublicArtisanProfile | null> {
    const select = PROFILE_SELECT;
    return this.prisma.artisanProfile.findFirst({
      where: { id, ...this.publicVisibilityWhere },
      select,
    }) as unknown as Promise<PublicArtisanProfile | null>;
  }

  // ---------------------------------------------------------------------------
  // Count published oeuvres for an artisan
  // ---------------------------------------------------------------------------

  async countPublishedOeuvres(artisanId: string): Promise<number> {
    return this.prisma.oeuvre.count({
      where: { artisanId, statut: 'PUBLIEE' },
    });
  }

  // ---------------------------------------------------------------------------
  // Find published oeuvres by artisan (paginated)
  // ---------------------------------------------------------------------------

  async findPublishedOeuvresByArtisan(
    artisanId: string,
    page: number,
    limit: number
  ): Promise<{ oeuvres: PublicArtisanOeuvre[]; total: number }> {
    const where: Prisma.OeuvreWhereInput = { artisanId, statut: 'PUBLIEE' };

    const [oeuvres, total] = await Promise.all([
      this.prisma.oeuvre.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: OEUVRE_SELECT,
      }) as unknown as Promise<PublicArtisanOeuvre[]>,
      this.prisma.oeuvre.count({ where }),
    ]);

    return { oeuvres, total };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private buildOrderBy(
    tri: ListArtisansQuery['tri']
  ): Prisma.ArtisanProfileOrderByWithRelationInput {
    switch (tri) {
      case 'oldest':
        return { createdAt: 'asc' };
      case 'name_asc':
        return { nomAtelier: 'asc' };
      case 'name_desc':
        return { nomAtelier: 'desc' };
      case 'recent':
      default:
        return { createdAt: 'desc' };
    }
  }
}