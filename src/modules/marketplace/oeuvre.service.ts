import { OeuvreRepository } from './oeuvre.repository.js';
import type { PublicOeuvreSelect, AdminOeuvreSelect } from './types.js';
import type { ArtworkStatus } from '../../generated/prisma/client.js';
import { NotFoundError, ForbiddenError, ConflictError } from '../../common/errors/AppError.js';

const ACTIVE_USER_STATUS = 'ACTIF';

type OeuvreData = {
  titre: string;
  description: string;
  technique: string;
  materiaux: string;
  dimensions: string;
  poids?: number;
  anneeCreation: number;
  prixXOF: number;
  categorieId: string;
};

export class OeuvreService {
  constructor(private readonly repository: OeuvreRepository) {}

  private async validateArtisan(artisanId: string) {
    const profile = await this.repository.findArtisanProfileById(artisanId);
    if (!profile) {
      throw new NotFoundError('Profil artisan non trouvé');
    }
    if (profile.user.role !== 'ARTISAN') {
      throw new ForbiddenError("L'artisanId doit référencer un compte avec le rôle ARTISAN");
    }
    if (profile.user.statut !== ACTIVE_USER_STATUS) {
      throw new ForbiddenError('Profil artisan inactif');
    }
    return profile;
  }

  async createOeuvre(artisanId: string, input: OeuvreData) {
    const profile = await this.validateArtisan(artisanId);

    const categorie = await this.repository.findCategorieById(input.categorieId);
    if (!categorie) {
      throw new NotFoundError('Catégorie non trouvée');
    }

    return this.repository.create({
      ...input,
      artisanId: profile.id,
    });
  }

  async getMyOeuvres(artisanUserId: string, page: number, limit: number, statut?: ArtworkStatus) {
    const artisanProfile = await this.repository.findArtisanProfileByUserId(artisanUserId);
    if (!artisanProfile) {
      throw new ForbiddenError('Profil artisan non trouvé');
    }

    return this.repository.findByArtisanId(artisanProfile.id, page, limit, statut);
  }

  async getMyOeuvre(artisanUserId: string, oeuvreId: string) {
    const artisanProfile = await this.repository.findArtisanProfileByUserId(artisanUserId);
    if (!artisanProfile) {
      throw new ForbiddenError('Profil artisan non trouvé');
    }

    const oeuvre = await this.repository.findById(oeuvreId);
    if (!oeuvre) {
      throw new NotFoundError('Œuvre non trouvée');
    }

    if (oeuvre.artisanId !== artisanProfile.id) {
      throw new ForbiddenError('Cette œuvre ne vous appartient pas');
    }

    return oeuvre;
  }

  async updateOeuvre(
    oeuvreId: string,
    input: {
      titre?: string;
      description?: string;
      technique?: string;
      materiaux?: string;
      dimensions?: string;
      poids?: number | null;
      anneeCreation?: number;
      prixXOF?: number;
      categorieId?: string;
      estMiseEnAvant?: boolean;
    }
  ) {
    const oeuvre = await this.repository.findById(oeuvreId);
    if (!oeuvre) {
      throw new NotFoundError('Œuvre non trouvée');
    }

    if (oeuvre.statut !== 'BROUILLON' && oeuvre.statut !== 'EN_ATTENTE_VALIDATION') {
      throw new ConflictError('Seules les œuvres non publiées peuvent être modifiées');
    }

    if (input.categorieId) {
      const categorie = await this.repository.findCategorieById(input.categorieId);
      if (!categorie) {
        throw new NotFoundError('Catégorie non trouvée');
      }
    }

    return this.repository.update(oeuvreId, input);
  }

  async deleteOeuvre(oeuvreId: string) {
    const oeuvre = await this.repository.findById(oeuvreId);
    if (!oeuvre) {
      throw new NotFoundError('Œuvre non trouvée');
    }

    if (oeuvre.statut !== 'BROUILLON') {
      throw new ConflictError('Seules les œuvres en brouillon peuvent être supprimées');
    }

    const ligneCommandeCount = await this.repository.countLignesCommande(oeuvreId);
    if (ligneCommandeCount > 0) {
      throw new ConflictError('Cette œuvre est liée à des commandes et ne peut pas être supprimée');
    }

    return this.repository.delete(oeuvreId);
  }

  async publishOeuvre(adminUserId: string, oeuvreId: string) {
    const adminProfile = await this.repository.findAdminProfileByUserId(adminUserId);
    if (!adminProfile) {
      throw new ForbiddenError('Profil admin non trouvé');
    }

    const oeuvre = await this.repository.findById(oeuvreId);
    if (!oeuvre) {
      throw new NotFoundError('Œuvre non trouvée');
    }

    if (oeuvre.statut !== 'BROUILLON' && oeuvre.statut !== 'EN_ATTENTE_VALIDATION') {
      throw new ConflictError('Seules les œuvres non publiées peuvent être publiées');
    }

    const mediaCount = await this.repository.countMedias(oeuvreId, 'OEUVRE');
    if (mediaCount === 0) {
      throw new ConflictError('Au moins une image est requise pour publier une œuvre');
    }

    return this.repository.publish(oeuvreId, adminProfile.id);
  }

  async withdrawOeuvreAdmin(oeuvreId: string) {
    const oeuvre = await this.repository.findById(oeuvreId);
    if (!oeuvre) {
      throw new NotFoundError('Œuvre non trouvée');
    }

    if (oeuvre.statut !== 'PUBLIEE') {
      throw new ConflictError('Seules les œuvres publiées peuvent être retirées par un admin');
    }

    await this.repository.invalidateCertificat(oeuvreId);

    return this.repository.withdraw(oeuvreId);
  }

  async getAllAdmin(
    page: number,
    limit: number,
    filters: {
      statut?: ArtworkStatus;
      artisanId?: string;
      categorieId?: string;
    },
    select: AdminOeuvreSelect
  ) {
    return this.repository.findAllAdmin(page, limit, filters, select);
  }

  async getOeuvreAdmin(oeuvreId: string) {
    const oeuvre = await this.repository.findById(oeuvreId);
    if (!oeuvre) {
      throw new NotFoundError('Œuvre non trouvée');
    }
    return oeuvre;
  }

  async getPublishedPublic(
    page: number,
    limit: number,
    filters: {
      categorieId?: string;
      prixMin?: number;
      prixMax?: number;
      artisanType?: string;
      localisation?: string;
      q?: string;
      tri?: string;
    },
    select: PublicOeuvreSelect
  ) {
    return this.repository.findPublishedPublic(page, limit, filters, select);
  }

  async getFeatured(limit: number, select: PublicOeuvreSelect) {
    return this.repository.findFeatured(limit, select);
  }

  async getOeuvrePublic(oeuvreId: string, select: PublicOeuvreSelect) {
    const oeuvre = await this.repository.findByIdPublic(oeuvreId, select);
    if (!oeuvre) {
      throw new NotFoundError('Œuvre non trouvée');
    }
    return oeuvre;
  }

  async getOeuvresByArtisanPublic(
    artisanId: string,
    page: number,
    limit: number,
    select: PublicOeuvreSelect
  ) {
    const artisanProfile = await this.repository.findArtisanProfileByUserId(artisanId);
    if (!artisanProfile) {
      throw new NotFoundError('Artisan non trouvé');
    }

    return this.repository.findPublishedByArtisan(artisanProfile.id, page, limit, select);
  }
}
