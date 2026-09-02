import {
  Prisma,
  type AdminAccessLevel,
  type BuyerType,
  type PrismaClient,
  type UserRole,
  type UserStatus,
} from '../../generated/prisma/client.js';

export type ListUsersOptions = {
  page: number;
  limit: number;
  q?: string;
  role?: UserRole;
  statut?: UserStatus;
  bloques?: boolean;
};

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

export class UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findById(id: string) {
    return this.prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: {
        buyerProfile: true,
        artisanProfile: true,
        adminProfile: true,
      },
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
          include: { artisanProfile: true, buyerProfile: true, adminProfile: true },
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
          include: { artisanProfile: true, buyerProfile: true, adminProfile: true },
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
          include: { artisanProfile: true, buyerProfile: true, adminProfile: true },
        });
      });
    }

    return this.prisma.user.create({
      data: baseUserData,
      include: { artisanProfile: true, buyerProfile: true, adminProfile: true },
    });
  }

  async updateStatut(id: string, statut: UserStatus) {
    return this.prisma.user.update({
      where: { id },
      data: { statut },
      include: { artisanProfile: true, buyerProfile: true, adminProfile: true },
    });
  }

  async updateRole(id: string, role: UserRole) {
    return this.prisma.user.update({
      where: { id },
      data: { role },
      include: { artisanProfile: true, buyerProfile: true, adminProfile: true },
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
        include: { artisanProfile: true, buyerProfile: true, adminProfile: true },
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
    const where: Prisma.UserWhereInput = {
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

    const orderBy: Prisma.UserOrderByWithRelationInput = { createdAt: 'desc' };

    const [total, items] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy,
        skip: (options.page - 1) * options.limit,
        take: options.limit,
        select: {
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
        },
      }),
    ]);

    return { items, total, page: options.page, limit: options.limit };
  }
}
