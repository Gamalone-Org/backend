import { ArtisanPublicRepository } from './artisan-public.repository.js';
import { NotFoundError } from '../../common/errors/AppError.js';

// ---------------------------------------------------------------------------
// Social media keys — only explicitly public fields from liensReseauxSociaux
// ---------------------------------------------------------------------------

const PUBLIC_SOCIAL_KEYS = ['instagram', 'facebook', 'whatsapp'] as const;

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export class ArtisanPublicService {
  constructor(private readonly repository: ArtisanPublicRepository) {}

  // ---------------------------------------------------------------------------
  // List public artisans
  // ---------------------------------------------------------------------------

  async getPublicArtisans(
    page: number,
    limit: number,
    filters: { q?: string; pays?: string; ville?: string; specialite?: string },
    tri: 'recent' | 'oldest' | 'name_asc' | 'name_desc'
  ) {
    const result = await this.repository.findPublicArtisans(page, limit, filters, tri);

    const artisans = result.artisans.map((a) => ({
      id: a.id,
      nom: a.user.nom,
      nomAtelier: a.nomAtelier,
      specialite: a.specialite,
      type: a.type,
      localisation: a.localisation,
      anneesExperience: a.anneesExperience,
      estCertifie: a.estCertifie,
      photoProfilUrl: a.photoProfilUrl,
      ville: a.ville,
      pays: a.pays,
      bioCourte: a.bioCourte,
      anneeCreation: a.anneeCreation,
    }));

    return {
      artisans,
      total: result.total,
      page,
      limit,
    };
  }

  // ---------------------------------------------------------------------------
  // Get public artisan profile
  // ---------------------------------------------------------------------------

  async getPublicArtisan(identifier: string) {
    const profile = await this.repository.findPublicArtisanById(identifier);
    if (!profile) {
      throw new NotFoundError('Artisan non trouve');
    }

    const nombreOeuvres = await this.repository.countPublishedOeuvres(profile.id);

    const rawLinks = (profile.liensReseauxSociaux as Record<string, string> | null) ?? {};
    const reseauxSociaux: Record<string, string> = {};
    for (const key of PUBLIC_SOCIAL_KEYS) {
      if (rawLinks[key]) {
        reseauxSociaux[key] = rawLinks[key];
      }
    }

    return {
      id: profile.id,
      nom: profile.user.nom,
      nomAtelier: profile.nomAtelier,
      type: profile.type,
      specialite: profile.specialite,
      biographie: profile.biographie,
      localisation: profile.localisation,
      anneesExperience: profile.anneesExperience,
      estCertifie: profile.estCertifie,
      photoProfilUrl: profile.photoProfilUrl,
      photoBanniereUrl: profile.photoBanniereUrl,
      anneeCreation: profile.anneeCreation,
      ville: profile.ville,
      pays: profile.pays,
      bioCourte: profile.bioCourte,
      histoire: profile.histoire,
      siteWeb: profile.siteWeb,
      reseauxSociaux,
      atelierPhotos: profile.atelierPhotos,
      processus: profile.processusEtapes,
      expositions: profile.expositions,
      statistiques: { nombreOeuvres },
      createdAt: profile.createdAt,
    };
  }

  // ---------------------------------------------------------------------------
  // Get public oeuvres by artisan
  // ---------------------------------------------------------------------------

  async getPublicArtisanOeuvres(identifier: string, page: number, limit: number) {
    const profile = await this.repository.findPublicArtisanById(identifier);
    if (!profile) {
      throw new NotFoundError('Artisan non trouve');
    }

    const result = await this.repository.findPublishedOeuvresByArtisan(
      profile.id,
      page,
      limit
    );

    return {
      oeuvres: result.oeuvres,
      total: result.total,
      page,
      limit,
    };
  }
}
