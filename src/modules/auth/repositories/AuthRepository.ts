import {
  Prisma,
  type PrismaClient,
  type User,
  type UserRole,
  type UserStatus,
  type PhoneVerificationStatus,
  type ArtisanType,
} from '../../../generated/prisma/client.js';

export type CreateUserWithCredentialsInput = {
  telephone: string;
  email?: string | null;
  username?: string | null;
  nom?: string | null;
  motDePasseHash: string;
  role: UserRole;
  artisanProfile?: {
    type?: ArtisanType;
    nomAtelier: string;
    specialite: string;
    localisation: string;
    biographie: string;
    anneesExperience: number;
  } | null;
  buyerProfile?: {
    adresseLivraison?: string;
  } | null;
};

export class AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByPhone(phone: string) {
    return this.prisma.user.findUnique({
      where: { telephone: phone },
    });
  }

  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
    });
  }

  async findByUsername(username: string) {
    return this.prisma.user.findUnique({
      where: { username },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
    });
  }

  async createUserWithCredentials(data: CreateUserWithCredentialsInput): Promise<User> {
    const userData = {
      telephone: data.telephone,
      email: data.email ?? null,
      username: data.username ?? null,
      nom: data.nom ?? null,
      motDePasse: data.motDePasseHash,
      role: data.role,
      statut: 'EN_ATTENTE_VALIDATION',
      telephoneVerificationStatus: 'NON_VERIFIE',
      telephoneVerifiedAt: null,
    } as const;

    if (data.role === 'ARTISAN' && data.artisanProfile) {
      return this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({ data: userData });
        await tx.artisanProfile.create({
          data: {
            userId: user.id,
            type: data.artisanProfile!.type ?? 'ARTISAN',
            nomAtelier: data.artisanProfile!.nomAtelier,
            specialite: data.artisanProfile!.specialite,
            localisation: data.artisanProfile!.localisation,
            biographie: data.artisanProfile!.biographie,
            anneesExperience: data.artisanProfile!.anneesExperience,
          },
        });
        return user;
      });
    }

    if (data.role === 'ACHETEUR' && data.buyerProfile) {
      return this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({ data: userData });
        await tx.buyerProfile.create({
          data: {
            userId: user.id,
            adresseLivraison: data.buyerProfile!.adresseLivraison ?? '',
          },
        });
        return user;
      });
    }

    return this.prisma.user.create({ data: userData });
  }

  isUniqueConstraintError(error: unknown): boolean {
    return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
  }

  async createUser(phone: string, role: UserRole = 'ACHETEUR') {
    return this.prisma.user.create({
      data: {
        telephone: phone,
        role,
        statut: 'EN_ATTENTE_VALIDATION',
        telephoneVerificationStatus: 'NON_VERIFIE',
        telephoneVerifiedAt: null,
      },
    });
  }

  async updatePhoneVerification(
    userId: string,
    status: PhoneVerificationStatus = 'VERIFIE',
    verifiedAt: Date = new Date()
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        telephoneVerificationStatus: status,
        telephoneVerifiedAt: verifiedAt,
        updatedAt: new Date(),
      },
    });
  }

  async getUserWithRequiredRelations(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        buyerProfile: true,
        artisanProfile: true,
        adminProfile: true,
      },
    });
  }

  async updateUserStatus(userId: string, statut: UserStatus) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { statut },
    });
  }

  async findAdminProfileByUserId(userId: string) {
    return this.prisma.adminProfile.findUnique({
      where: { userId },
    });
  }

  async findAdminPermissionsByProfileId(adminProfileId: string) {
    return this.prisma.adminProfilePermission.findMany({
      where: { adminProfileId },
      select: { permission: true },
    });
  }
}
