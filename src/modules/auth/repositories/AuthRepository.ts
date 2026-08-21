import type { PrismaClient, UserRole, UserStatus, PhoneVerificationStatus } from '../../../../generated/prisma/client.js';

export class AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByPhone(phone: string) {
    return this.prisma.user.findUnique({
      where: { telephone: phone },
    });
  }

  async findById(id: string) {
    return this.prisma.user.findUnique({
      where: { id },
    });
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
}
