import type { AdminAccessLevel } from '../../../generated/prisma/client.js';
import {
  AdminArtisansRepository,
  type ListArtisansOptions,
} from './admin-artisans.repository.js';
import { ForbiddenError, NotFoundError } from '../../../common/errors/AppError.js';
import { hasMinAdminAccessLevel } from '../../../config/kyc.js';
import type { AdminArtisanDetail } from './admin-artisans.types.js';
import type { ArtworkStatus, OrderStatus } from '../../../generated/prisma/client.js';

export type AdminActor = {
  id: string;
  role: string;
  adminAccessLevel?: AdminAccessLevel | null;
};

const ARTISAN_ROLE = 'ARTISAN';

export class AdminArtisansService {
  constructor(
    private readonly repository: AdminArtisansRepository,
    private readonly minimumReadLevel: AdminAccessLevel = 'SUPPORT'
  ) {}

  private assertReadAccess(actor: AdminActor): void {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Admin access required');
    }
    if (!hasMinAdminAccessLevel(actor.adminAccessLevel, this.minimumReadLevel)) {
      throw new ForbiddenError('Insufficient admin access level');
    }
  }

  private async assertArtisanExists(artisanId: string): Promise<{ userId: string }> {
    const profile = await this.repository.findArtisanDetail(artisanId);
    if (!profile || !profile.user || profile.user.deletedAt || profile.user.role !== ARTISAN_ROLE) {
      throw new NotFoundError('Artisan non trouvé');
    }
    return { userId: profile.user.id };
  }

  async listArtisans(actor: AdminActor, options: ListArtisansOptions) {
    this.assertReadAccess(actor);
    return this.repository.listArtisans(options);
  }

  async getArtisanDetail(actor: AdminActor, artisanId: string): Promise<AdminArtisanDetail> {
    this.assertReadAccess(actor);

    const profile = await this.repository.findArtisanDetail(artisanId);
    if (!profile || !profile.user || profile.user.deletedAt || profile.user.role !== ARTISAN_ROLE) {
      throw new NotFoundError('Artisan non trouvé');
    }

    const [latestKyc, stats] = await Promise.all([
      this.repository.latestKycByUserIds([profile.user.id]),
      this.repository.getArtisanStats(artisanId),
    ]);

    const kycRow = latestKyc[0] ?? null;

    return {
      profil: {
        userId: profile.user.id,
        nom: profile.user.nom,
        email: profile.user.email,
        telephone: profile.user.telephone,
        accountStatus: profile.user.statut,
        inscription: profile.user.createdAt.toISOString(),
      },
      artisan: {
        id: profile.id,
        type: profile.type,
        nomAtelier: profile.nomAtelier,
        specialite: profile.specialite,
        biographie: profile.biographie,
        localisation: profile.localisation,
        anneesExperience: profile.anneesExperience,
        estCertifie: profile.estCertifie,
        scoreFiabilite: profile.scoreFiabilite === null ? null : profile.scoreFiabilite.toNumber(),
        photoAtelierUrl: profile.photoAtelierUrl,
        validatedAt: profile.validatedAt,
        createdAt: profile.createdAt,
      },
      kyc: kycRow
        ? {
            id: kycRow.kycId,
            status: kycRow.status,
            submittedAt: kycRow.submittedAt,
            reviewedAt: kycRow.reviewedAt,
          }
        : null,
      statistiques: stats,
    };
  }

  async listArtworks(
    actor: AdminActor,
    artisanId: string,
    options: { page: number; limit: number; statut?: ArtworkStatus }
  ) {
    this.assertReadAccess(actor);
    await this.assertArtisanExists(artisanId);
    return this.repository.listArtworks(artisanId, options);
  }

  async listOrders(
    actor: AdminActor,
    artisanId: string,
    options: { page: number; limit: number; statut?: OrderStatus }
  ) {
    this.assertReadAccess(actor);
    await this.assertArtisanExists(artisanId);
    return this.repository.listOrders(artisanId, options);
  }
}