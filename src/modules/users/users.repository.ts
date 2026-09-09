import {
  Prisma,
  type AdminAccessLevel,
  type BuyerType,
  type PrismaClient,
  type UserRole,
  type UserStatus,
} from '../../generated/prisma/client.js';

export type UserFilters = {
  q?: string;
  role?: UserRole;
  statut?: UserStatus;
  bloques?: boolean;
};

export type ListUsersOptions = UserFilters & {
  page: number;
  limit: number;
};

export type ExportUsersOptions = UserFilters;

type CreateBuyerProfileInput = {
  adresseLivraison?: string;
  typeClient?: BuyerType;
  devise?: string;
  langue?: string;
};

type CreateArtisanProfileInput = {
  type?: 'ARTISAN' | 'ARTISTE';
  nomAtelier: string;
  specialite: string;
  localisation: string;
  biographie?: string;
  anneesExperience?: number;
};

export type CreateUserData = {
  telephone: string;
  email?: string | null;
  nom?: string | null;
  motDePasseHash: string;
  role: UserRole;
  statut?: UserStatus;
  niveauAcces?: AdminAccessLevel;
  artisanProfile?: CreateArtisanProfileInput | null;
  buyerProfile?: CreateBuyerProfileInput | null;
};

const USER_SUMMARY_SELECT = {
  id: true,
  email: true,
  nom: true,
  telephone: true,
  statut: true,
  role: true,
  telephoneVerificationStatus: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

const USER_DETAIL_SELECT = {
  id: true,
  email: true,
  nom: true,
  telephone: true,
  statut: true,
  role: true,
  telephoneVerificationStatus: true,
  telephoneVerifiedAt: true,
  anonymizedAt: true,
  deletedAt: true,
  createdAt: true,
  updatedAt: true,
  buyerProfile: true,
  artisanProfile: true,
  adminProfile: true,
} satisfies Prisma.UserSelect;

const USER_LIST_SELECT = {
  ...USER_SUMMARY_SELECT,
  artisanProfile: {
    select: { id: true, nomAtelier: true, specialite: true, estCertifie: true },
  },
  buyerProfile: {
    select: { id: true, typeClient: true, adresseLivraison: true },
  },
  adminProfile: {
    select: { id: true, niveauAcces: true },
  },
} satisfies Prisma.UserSelect;

function buildUserWhere(options: UserFilters): Prisma.UserWhereInput {
  return {
    deletedAt: null,
    ...(options.role ? { role: options.role } : {}),
    ...(options.statut ? { statut: options.statut } : {}),
    ...(options.bloques === true ? { statut: 'SUSPENDU' } : {}),
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

export class UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string) {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      select: USER_DETAIL_SELECT,
    });
  }

  async findByTelephone(telephone: string) {
    return this.prisma.user.findUnique({ where: { telephone } });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  isUniqueConstraintError(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'
    );
  }

  async createUser(data: CreateUserData) {
    const { artisanProfile, buyerProfile, niveauAcces, ...userData } = data;

    const baseUserData = {
      telephone: userData.telephone,
      email: userData.email ?? null,
      nom: userData.nom ?? null,
      motDePasse: userData.motDePasseHash,
      role: userData.role,
      statut: userData.statut ?? 'EN_ATTENTE_VALIDATION',
      telephoneVerificationStatus: 'NON_VERIFIE' as const,
      telephoneVerifiedAt: null,
    };

    if (data.role === 'ARTISAN' && artisanProfile) {
      return this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({ data: baseUserData });
        await tx.artisanProfile.create({
          data: {
            userId: user.id,
            type: artisanProfile.type ?? 'ARTISAN',
            nomAtelier: artisanProfile.nomAtelier,
            specialite: artisanProfile.specialite,
            localisation: artisanProfile.localisation,
            biographie: artisanProfile.biographie ?? '',
            anneesExperience: artisanProfile.anneesExperience ?? 0,
          },
        });
        return tx.user.findUniqueOrThrow({
          where: { id: user.id },
          select: USER_DETAIL_SELECT,
        });
      });
    }

    if (data.role === 'ADMIN' && niveauAcces) {
      return this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({ data: baseUserData });
        await tx.adminProfile.create({
          data: {
            userId: user.id,
            niveauAcces,
            departement: '',
          },
        });
        return tx.user.findUniqueOrThrow({
          where: { id: user.id },
          select: USER_DETAIL_SELECT,
        });
      });
    }

    if (data.role === 'ACHETEUR') {
      return this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({ data: baseUserData });
        await tx.buyerProfile.create({
          data: {
            userId: user.id,
            adresseLivraison: buyerProfile?.adresseLivraison ?? '',
            typeClient: buyerProfile?.typeClient ?? 'PARTICULIER',
            devise: buyerProfile?.devise ?? 'XOF',
            langue: buyerProfile?.langue ?? 'fr',
          },
        });
        return tx.user.findUniqueOrThrow({
          where: { id: user.id },
          select: USER_DETAIL_SELECT,
        });
      });
    }

    return this.prisma.user.create({
      data: baseUserData,
      select: USER_DETAIL_SELECT,
    });
  }

  async updateStatut(id: string, statut: UserStatus) {
    return this.prisma.user.update({
      where: { id },
      data: { statut },
      select: USER_DETAIL_SELECT,
    });
  }

  async updateRole(id: string, role: UserRole) {
    return this.prisma.user.update({
      where: { id },
      data: { role },
      select: USER_DETAIL_SELECT,
    });
  }

  async changeRole(
    id: string,
    role: UserRole,
    niveauAcces: AdminAccessLevel | undefined,
    currentAdminProfileExists: boolean
  ) {
    return this.prisma.$transaction(async (tx) => {
      if (role === 'ADMIN' && !currentAdminProfileExists) {
        await tx.adminProfile.create({
          data: { userId: id, niveauAcces: niveauAcces ?? 'SUPPORT', departement: '' },
        });
      }
      if (role === 'ADMIN' && currentAdminProfileExists && niveauAcces) {
        await tx.adminProfile.update({
          where: { userId: id },
          data: { niveauAcces },
        });
      }
      if (role !== 'ADMIN' && currentAdminProfileExists) {
        await tx.adminProfile.deleteMany({ where: { userId: id } });
      }
      return tx.user.update({
        where: { id },
        data: { role },
        select: USER_DETAIL_SELECT,
      });
    });
  }

  async createAdminProfile(userId: string, niveauAcces: AdminAccessLevel) {
    return this.prisma.adminProfile.create({
      data: { userId, niveauAcces, departement: '' },
    });
  }

  async deleteAdminProfile(userId: string) {
    return this.prisma.adminProfile.deleteMany({ where: { userId } });
  }

  async updateAdminProfileLevel(userId: string, niveauAcces: AdminAccessLevel) {
    return this.prisma.adminProfile.update({
      where: { userId },
      data: { niveauAcces },
    });
  }

  async listUsers(options: ListUsersOptions) {
    const where = buildUserWhere(options);
    const orderBy: Prisma.UserOrderByWithRelationInput = { createdAt: 'desc' };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy,
        skip: (options.page - 1) * options.limit,
        take: options.limit,
        select: USER_LIST_SELECT,
      }),
    ]);

    return { items, total, page: options.page, limit: options.limit };
  }

  async findForExport(options: ExportUsersOptions, limit: number) {
    const where = buildUserWhere(options);
    return this.prisma.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: USER_LIST_SELECT,
    });
  }
}
