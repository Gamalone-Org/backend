import type { OtpPurpose, OtpStatus } from '../../../generated/prisma/client.js';
import { PrismaClient } from '../../../generated/prisma/client.js';

export type OtpRecord = {
  id: string;
  userId: string | null;
  phone: string;
  codeHash: string;
  purpose: OtpPurpose;
  status: OtpStatus;
  expiresAt: Date;
  createdAt: Date;
  usedAt: Date | null;
  attemptCount: number;
  maxAttempts: number;
  lastSentAt: Date | null;
  consumedForResetAt: Date | null;
  updatedAt: Date;
};

export class OtpRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(data: {
    userId?: string | null;
    phone: string;
    codeHash: string;
    purpose: OtpPurpose;
    expiresAt: Date;
    maxAttempts: number;
    lastSentAt?: Date;
  }): Promise<OtpRecord> {
    return this.prisma.otpCode.create({
      data: {
        userId: data.userId ?? null,
        phone: data.phone,
        codeHash: data.codeHash,
        purpose: data.purpose,
        expiresAt: data.expiresAt,
        maxAttempts: data.maxAttempts,
        lastSentAt: data.lastSentAt ?? new Date(),
      },
    });
  }

  async findLatestByPhoneAndPurpose(phone: string, purpose: OtpPurpose): Promise<OtpRecord | null> {
    return this.prisma.otpCode.findFirst({
      where: {
        phone,
        purpose,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async findLatestActiveByPhoneAndPurpose(phone: string, purpose: OtpPurpose): Promise<OtpRecord | null> {
    return this.prisma.otpCode.findFirst({
      where: {
        phone,
        purpose,
        status: 'EN_ATTENTE',
        expiresAt: {
          gt: new Date(),
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  async invalidateActiveByPhoneAndPurpose(phone: string, purpose: OtpPurpose): Promise<number> {
    const result = await this.prisma.otpCode.updateMany({
      where: {
        phone,
        purpose,
        status: 'EN_ATTENTE',
        expiresAt: {
          gt: new Date(),
        },
      },
      data: {
        status: 'EXPIRE',
        usedAt: new Date(),
      },
    });

    return result.count;
  }

  async incrementAttempts(id: string): Promise<OtpRecord> {
    return this.prisma.otpCode.update({
      where: { id },
      data: {
        attemptCount: { increment: 1 },
      },
    });
  }

  async markUsed(id: string): Promise<OtpRecord> {
    return this.prisma.otpCode.update({
      where: { id },
      data: {
        status: 'UTILISE',
        usedAt: new Date(),
      },
    });
  }

  async markExpired(id: string): Promise<OtpRecord> {
    return this.prisma.otpCode.update({
      where: { id },
      data: {
        status: 'EXPIRE',
      },
    });
  }

  async markBlocked(id: string): Promise<OtpRecord> {
    return this.prisma.otpCode.update({
      where: { id },
      data: {
        status: 'BLOQUE',
      },
    });
  }

  async countRecentByPhone(phone: string, since: Date): Promise<number> {
    return this.prisma.otpCode.count({
      where: {
        phone,
        createdAt: {
          gte: since,
        },
      },
    });
  }

  /**
   * Trouve un OTP PASSWORD_RESET valide (status EN_ATTENTE, non expiré, non consommé)
   * et le marque atomiquement comme consommé pour la réinitialisation.
   * Retourne l'OTP s'il a été consommé avec succès, null sinon.
   */
  async findAndConsumeResetAuthorization(
    phone: string,
    purpose: OtpPurpose
  ): Promise<OtpRecord | null> {
    const now = new Date();

    // Transaction pour garantir l'atomicité
    return this.prisma.$transaction(async (tx) => {
      const otp = await tx.otpCode.findFirst({
        where: {
          phone,
          purpose,
          status: 'EN_ATTENTE',
          expiresAt: {
            gt: now,
          },
          consumedForResetAt: null,
        },
        orderBy: {
          createdAt: 'desc',
        },
      });

      if (!otp) {
        return null;
      }

      // Marquer comme consommé atomiquement
      const updated = await tx.otpCode.update({
        where: { id: otp.id },
        data: {
          consumedForResetAt: now,
          status: 'UTILISE',
          usedAt: now,
        },
      });

      return updated;
    });
  }

  /**
   * Invalide tous les OTP actifs de réinitialisation pour un téléphone donné
   * (utilisé après réinitialisation réussie du mot de passe).
   */
  async invalidateResetOtpsByPhone(phone: string): Promise<number> {
    const result = await this.prisma.otpCode.updateMany({
      where: {
        phone,
        purpose: 'PASSWORD_RESET',
        status: 'EN_ATTENTE',
        expiresAt: {
          gt: new Date(),
        },
      },
      data: {
        status: 'EXPIRE',
        usedAt: new Date(),
      },
    });

    return result.count;
  }
}
