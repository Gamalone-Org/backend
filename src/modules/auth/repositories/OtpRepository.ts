import type { OtpPurpose, OtpStatus } from '../../../../generated/prisma/client';
import { PrismaClient } from '../../../../generated/prisma/client';

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
}
