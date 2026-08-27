import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { ANONYMIZED_JSON_MARKER } from '../../config/kyc.js';

export class KycPrivacyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findKycById(kycId: string) {
    return this.prisma.kyc.findUnique({
      where: { id: kycId },
      include: {
        documents: {
          where: { deletedAt: null },
        },
      },
    });
  }

  async findEligibleForPurge(now: Date, limit: number) {
    return this.prisma.kyc.findMany({
      where: {
        retentionUntil: { lte: now },
        legalHold: false,
        anonymizedAt: null,
        deletedAt: null,
      },
      take: limit,
      orderBy: { retentionUntil: 'asc' },
      include: {
        documents: {
          where: { deletedAt: null, anonymizedAt: null },
        },
      },
    });
  }

  async setLegalHold(kycId: string, legalHold: boolean) {
    return this.prisma.kyc.update({
      where: { id: kycId },
      data: { legalHold },
    });
  }

  async anonymizeKycRecord(kycId: string, options?: { force?: boolean }) {
    const now = new Date();
    const anonymizedJson = ANONYMIZED_JSON_MARKER as Prisma.InputJsonValue;

    return this.prisma.$transaction(async (tx) => {
      const kyc = await tx.kyc.findUnique({
        where: { id: kycId },
        include: {
          documents: {
            where: { deletedAt: null },
          },
        },
      });

      if (!kyc) {
        return null;
      }

      if (kyc.anonymizedAt) {
        return { id: kyc.id, anonymizedAt: kyc.anonymizedAt, alreadyAnonymized: true as const };
      }

      if (kyc.legalHold) {
        return { legalHoldBlocked: true as const };
      }

      if (!options?.force && kyc.retentionUntil && kyc.retentionUntil > now) {
        return { retentionNotReached: true as const };
      }

      const updated = await tx.kyc.update({
        where: { id: kycId },
        data: {
          identityData: anonymizedJson,
          professionData: anonymizedJson,
          additionalInfo: anonymizedJson,
          addressData: anonymizedJson,
          identityDocument: anonymizedJson,
          supportingDocs: anonymizedJson,
          rejectionReason: kyc.rejectionReason ? '[anonymized]' : null,
          anonymizedAt: now,
        },
      });

      return {
        id: updated.id,
        anonymizedAt: updated.anonymizedAt,
        documents: kyc.documents,
        alreadyAnonymized: false as const,
      };
    });
  }

  async markDocumentAnonymized(documentId: string) {
    const now = new Date();
    return this.prisma.kycDocument.update({
      where: { id: documentId },
      data: {
        secureUrl: 'anonymized',
        publicId: `anonymized/${documentId}`,
        anonymizedAt: now,
        deletedAt: now,
      },
    });
  }
}
