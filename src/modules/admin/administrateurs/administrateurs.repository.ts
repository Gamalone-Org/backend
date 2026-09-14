import {
  Prisma,
  type AdminAccessLevel,
  type AdminAuditAction,
  type AdminPermission,
  type PrismaClient,
  type UserStatus,
} from '../../../generated/prisma/client.js';
import type {
  AdminUserDetail,
  CreateAdminTransactionResult,
  ListAdministrateursOptions,
} from './administrateurs.types.js';

const ADMIN_LIST_SELECT = {
  id: true,
  email: true,
  nom: true,
  telephone: true,
  statut: true,
  role: true,
  createdAt: true,
  updatedAt: true,
  telephoneVerificationStatus: true,
  adminProfile: {
    select: {
      id: true,
      niveauAcces: true,
      departement: true,
      createdAt: true,
      updatedAt: true,
      permissions: { select: { permission: true } },
    },
  },
} satisfies Prisma.UserSelect;

function buildAdminWhere(options: ListAdministrateursOptions): Prisma.UserWhereInput {
  return {
    role: 'ADMIN',
    deletedAt: null,
    ...(options.statut ? { statut: options.statut } : {}),
    ...(options.niveauAcces ? { adminProfile: { is: { niveauAcces: options.niveauAcces } } } : {}),
    ...(options.q
      ? {
          OR: [
            { nom: { contains: options.q, mode: 'insensitive' } },
            { email: { contains: options.q, mode: 'insensitive' } },
            { telephone: { contains: options.q } },
          ],
        }
      : {}),
  };
}

export type CreateAdministrateurData = {
  telephone: string;
  email: string | null;
  nom: string;
  motDePasseHash: string;
  niveauAcces: Exclude<AdminAccessLevel, 'SUPER_ADMIN'>;
  departement: string;
  permissions: AdminPermission[];
};

export type UpdateAdministrateurData = {
  nom?: string;
  email?: string | null;
  departement?: string;
};

export class AdministrateurRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(options: ListAdministrateursOptions) {
    const where = buildAdminWhere(options);
    const orderBy: Prisma.UserOrderByWithRelationInput = { createdAt: 'desc' };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy,
        skip: (options.page - 1) * options.limit,
        take: options.limit,
        select: ADMIN_LIST_SELECT,
      }),
    ]);

    return { items, total, page: options.page, limit: options.limit };
  }

  async findById(adminProfileId: string) {
    const adminProfile = await this.prisma.adminProfile.findUnique({
      where: { id: adminProfileId },
      include: {
        permissions: { select: { permission: true } },
        user: true,
      },
    });
    if (!adminProfile) {
      return null;
    }
    return toAdminUserDetail(adminProfile);
  }

  async findByUserId(userId: string) {
    const adminProfile = await this.prisma.adminProfile.findUnique({
      where: { userId },
      include: {
        permissions: { select: { permission: true } },
        user: true,
      },
    });
    if (!adminProfile) {
      return null;
    }
    return toAdminUserDetail(adminProfile);
  }

  async findByTelephone(telephone: string) {
    return this.prisma.user.findUnique({ where: { telephone } });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  async createAdministrateur(
    data: CreateAdministrateurData
  ): Promise<CreateAdminTransactionResult> {
    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          telephone: data.telephone,
          email: data.email,
          nom: data.nom,
          motDePasse: data.motDePasseHash,
          role: 'ADMIN',
          statut: 'ACTIF',
          telephoneVerificationStatus: 'VERIFIE',
          telephoneVerifiedAt: new Date(),
        },
      });

      const adminProfile = await tx.adminProfile.create({
        data: {
          userId: user.id,
          niveauAcces: data.niveauAcces,
          departement: data.departement,
        },
      });

      if (data.permissions.length > 0) {
        await tx.adminProfilePermission.createMany({
          data: data.permissions.map((permission) => ({
            adminProfileId: adminProfile.id,
            permission,
          })),
        });
      }

      return { userId: user.id, adminProfileId: adminProfile.id };
    });
  }

  async updateAdministrateur(adminProfileId: string, data: UpdateAdministrateurData) {
    return this.prisma.$transaction(async (tx) => {
      const adminProfile = await tx.adminProfile.findUniqueOrThrow({
        where: { id: adminProfileId },
      });

      if (data.departement !== undefined) {
        await tx.adminProfile.update({
          where: { id: adminProfileId },
          data: { departement: data.departement },
        });
      }

      const userData: Prisma.UserUpdateInput = {};
      if (data.nom !== undefined) {
        userData.nom = data.nom;
      }
      if (data.email !== undefined) {
        userData.email = data.email;
      }

      await tx.user.update({
        where: { id: adminProfile.userId },
        data: userData,
      });
    });
  }

  async setPermissions(adminProfileId: string, permissions: AdminPermission[]): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.adminProfilePermission.deleteMany({ where: { adminProfileId } });
      if (permissions.length > 0) {
        await tx.adminProfilePermission.createMany({
          data: permissions.map((permission) => ({
            adminProfileId,
            permission,
          })),
        });
      }
    });
  }

  async updateStatut(adminProfileId: string, statut: UserStatus): Promise<number> {
    const result = await this.prisma.user.updateMany({
      where: { role: 'ADMIN', adminProfile: { is: { id: adminProfileId } } },
      data: { statut },
    });
    return result.count;
  }

  async countActiveByNiveauAcces(niveauAcces: AdminAccessLevel): Promise<number> {
    return this.prisma.user.count({
      where: {
        role: 'ADMIN',
        statut: 'ACTIF',
        adminProfile: { is: { niveauAcces } },
      },
    });
  }

  /**
   * Mise à jour du statut d'un administrateur avec protection atomique du
   * dernier SUPER_ADMIN (SELECT ... FOR UPDATE sur les profils SUPER_ADMIN
   * actifs pour empêcher la race condition TOCTOU).
   *
   * @returns le nombre de lignes mises à jour (0 = cible introuvable)
   */
  async updateStatutWithSuperAdminGuard(
    adminProfileId: string,
    statut: UserStatus
  ): Promise<number> {
    const { ConflictError, NotFoundError } = await import('../../../common/errors/AppError.js');
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT 1 FROM "users" "u"
        INNER JOIN "admin_profiles" "ap" ON "ap"."userId" = "u"."id"
        WHERE "u"."role" = 'ADMIN'
          AND "u"."statut" = 'ACTIF'
          AND "ap"."niveauAcces" = 'SUPER_ADMIN'
        FOR UPDATE
      `;

      const target = await tx.adminProfile.findUnique({
        where: { id: adminProfileId },
        include: { user: true },
      });
      if (!target) {
        throw new NotFoundError('Administrateur non trouvé');
      }

      const deactivating =
        target.user.role === 'ADMIN' &&
        target.niveauAcces === 'SUPER_ADMIN' &&
        target.user.statut === 'ACTIF' &&
        statut !== 'ACTIF';

      if (deactivating) {
        const count = await tx.user.count({
          where: {
            role: 'ADMIN',
            statut: 'ACTIF',
            adminProfile: { is: { niveauAcces: 'SUPER_ADMIN' } },
          },
        });
        if (count <= 1) {
          throw new ConflictError('Impossible de désactiver le dernier SUPER_ADMIN');
        }
      }

      const result = await tx.user.updateMany({
        where: { role: 'ADMIN', adminProfile: { is: { id: adminProfileId } } },
        data: { statut },
      });
      return result.count;
    });
  }

  async logAudit(
    action: AdminAuditAction,
    actorAdminId: string | null,
    targetAdminId: string | null,
    details: Prisma.InputJsonValue | undefined
  ) {
    return this.prisma.adminAuditLog.create({
      data: {
        action,
        actorAdminId,
        targetAdminId,
        details: details ?? undefined,
      },
    });
  }
}

function toAdminUserDetail(adminProfile: {
  id: string;
  niveauAcces: AdminAccessLevel;
  departement: string;
  createdAt: Date;
  updatedAt: Date;
  permissions: { permission: AdminPermission }[];
  user: {
    id: string;
    email: string | null;
    nom: string | null;
    telephone: string;
    statut: UserStatus;
    role: string;
    createdAt: Date;
    updatedAt: Date;
    telephoneVerificationStatus: string;
    telephoneVerifiedAt?: Date | null;
  };
}): AdminUserDetail {
  const { user: u, ...profile } = adminProfile;
  return {
    id: u.id,
    email: u.email,
    nom: u.nom,
    telephone: u.telephone,
    statut: u.statut,
    role: u.role,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    telephoneVerificationStatus: u.telephoneVerificationStatus,
    telephoneVerifiedAt: u.telephoneVerifiedAt ?? null,
    adminProfile: {
      id: profile.id,
      niveauAcces: profile.niveauAcces,
      departement: profile.departement,
      createdAt: profile.createdAt,
      updatedAt: profile.updatedAt,
      permissions: profile.permissions,
    },
  };
}
