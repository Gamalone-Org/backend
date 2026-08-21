import type { Prisma, PrismaClient } from '../../../generated/prisma/client.js';
import type { AdminKycListQuery, CreateKycDocumentData, SubmitKycInput } from './kyc.types.js';

const activeStatuses = ['BROUILLON', 'SOUMIS', 'EN_ATTENTE', 'VALIDE', 'CORRECTION_REQUISE'] as const;

export class KycRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findUserPhoneVerification(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: { telephoneVerificationStatus: true },
    });
  }

  async findAdminProfileByUserId(userId: string) {
    return this.prisma.adminProfile.findUnique({
      where: { userId },
    });
  }

  async findActiveByUserId(userId: string) {
    return this.prisma.kyc.findFirst({
      where: {
        userId,
        status: { in: [...activeStatuses] },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findById(id: string) {
    return this.prisma.kyc.findUnique({ where: { id } });
  }

  async findLatestByUserId(userId: string) {
    return this.prisma.kyc.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createSubmission(userId: string, input: SubmitKycInput) {
    const data: Prisma.KycCreateInput = {
      user: { connect: { id: userId } },
      status: 'SOUMIS',
      submittedAt: new Date(),
      identityData: input.identityData as Prisma.InputJsonValue,
      professionData: input.professionData as Prisma.InputJsonValue | undefined,
      additionalInfo: input.additionalInfo as Prisma.InputJsonValue | undefined,
      addressData: input.addressData as Prisma.InputJsonValue,
      identityDocument: input.identityDocument as Prisma.InputJsonValue,
      supportingDocs: input.supportingDocs as Prisma.InputJsonValue | undefined,
    };

    return this.prisma.kyc.create({ data });
  }

  async createResubmission(userId: string, previousKycId: string, input: SubmitKycInput) {
    const data: Prisma.KycCreateInput = {
      user: { connect: { id: userId } },
      previousSubmission: { connect: { id: previousKycId } },
      status: 'SOUMIS',
      submittedAt: new Date(),
      identityData: input.identityData as Prisma.InputJsonValue,
      professionData: input.professionData as Prisma.InputJsonValue | undefined,
      additionalInfo: input.additionalInfo as Prisma.InputJsonValue | undefined,
      addressData: input.addressData as Prisma.InputJsonValue,
      identityDocument: input.identityDocument as Prisma.InputJsonValue,
      supportingDocs: input.supportingDocs as Prisma.InputJsonValue | undefined,
    };

    return this.prisma.kyc.create({ data });
  }

  async createDocument(kycId: string, data: CreateKycDocumentData) {
    return this.prisma.kycDocument.create({
      data: {
        kyc: { connect: { id: kycId } },
        documentType: data.documentType,
        secureUrl: data.secureUrl,
        publicId: data.publicId,
        resourceType: data.resourceType,
        format: data.format,
        bytes: data.bytes,
        assetId: data.assetId,
      },
    });
  }

  async findDocumentsByKycId(kycId: string) {
    return this.prisma.kycDocument.findMany({
      where: { kycId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async findDocumentById(documentId: string) {
    return this.prisma.kycDocument.findUnique({
      where: { id: documentId },
    });
  }

  async deleteDocument(documentId: string) {
    return this.prisma.kycDocument.delete({
      where: { id: documentId },
    });
  }

  async findPendingReviews(query: AdminKycListQuery) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit = query.limit && query.limit > 0 ? query.limit : 10;
    const skip = (page - 1) * limit;

    const where: Prisma.KycWhereInput = query.status
      ? { status: query.status }
      : { status: { in: ['SOUMIS', 'EN_ATTENTE'] } };

    const [total, data] = await Promise.all([
      this.prisma.kyc.count({ where }),
      this.prisma.kyc.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: {
              id: true,
              telephone: true,
              email: true,
              role: true,
              statut: true,
              telephoneVerificationStatus: true,
            },
          },
          documents: {
            select: {
              id: true,
              documentType: true,
              createdAt: true,
            },
          },
        },
      }),
    ]);

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async findAdminDetailsById(id: string) {
    return this.prisma.kyc.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            telephone: true,
            email: true,
            role: true,
            statut: true,
            telephoneVerificationStatus: true,
            createdAt: true,
            artisanProfile: {
              select: {
                id: true,
                nomAtelier: true,
                specialite: true,
                localisation: true,
                estCertifie: true,
                scoreFiabilite: true,
              },
            },
          },
        },
        documents: {
          orderBy: { createdAt: 'asc' },
        },
        previousSubmission: {
          select: {
            id: true,
            status: true,
            submittedAt: true,
            reviewedAt: true,
            rejectionReason: true,
          },
        },
        reviewHistory: {
          orderBy: { createdAt: 'desc' },
          include: {
            admin: {
              select: {
                id: true,
                departement: true,
                niveauAcces: true,
                user: {
                  select: {
                    email: true,
                    telephone: true,
                  },
                },
              },
            },
          },
        },
      },
    });
  }

  async findReviewHistoryByKycId(kycId: string) {
    return this.prisma.kycReviewHistory.findMany({
      where: { kycId },
      orderBy: { createdAt: 'desc' },
      include: {
        admin: {
          select: {
            id: true,
            departement: true,
            niveauAcces: true,
            user: {
              select: {
                email: true,
                telephone: true,
              },
            },
          },
        },
      },
    });
  }

  async approveSubmission(id: string, adminProfileId: string) {
    return this.prisma.$transaction(async (tx) => {
      const kyc = await tx.kyc.findUnique({
        where: { id },
        include: {
          user: {
            include: {
              artisanProfile: true,
            },
          },
        },
      });

      if (!kyc) {
        return null;
      }

      if (kyc.status !== 'SOUMIS' && kyc.status !== 'EN_ATTENTE') {
        return { conflict: true, currentStatus: kyc.status } as const;
      }

      const updatedKyc = await tx.kyc.update({
        where: { id },
        data: {
          status: 'VALIDE',
          reviewedAt: new Date(),
          reviewedByAdminId: adminProfileId,
          rejectionReason: null,
        },
      });

      await tx.kycReviewHistory.create({
        data: {
          kycId: id,
          adminId: adminProfileId,
          action: 'APPROUVER',
          reason: null,
        },
      });

      if (kyc.user) {
        if (kyc.user.statut === 'EN_ATTENTE_VALIDATION') {
          await tx.user.update({
            where: { id: kyc.userId },
            data: { statut: 'ACTIF' },
          });
        }

        if (kyc.user.artisanProfile) {
          await tx.artisanProfile.update({
            where: { userId: kyc.userId },
            data: {
              estCertifie: true,
              validatedByAdminId: adminProfileId,
              validatedAt: new Date(),
            },
          });
        }
      }

      return updatedKyc;
    });
  }

  async rejectSubmission(id: string, adminProfileId: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const kyc = await tx.kyc.findUnique({ where: { id } });

      if (!kyc) {
        return null;
      }

      if (kyc.status !== 'SOUMIS' && kyc.status !== 'EN_ATTENTE') {
        return { conflict: true, currentStatus: kyc.status } as const;
      }

      const updatedKyc = await tx.kyc.update({
        where: { id },
        data: {
          status: 'REJETE',
          reviewedAt: new Date(),
          reviewedByAdminId: adminProfileId,
          rejectionReason: reason,
        },
      });

      await tx.kycReviewHistory.create({
        data: {
          kycId: id,
          adminId: adminProfileId,
          action: 'REJETER',
          reason,
        },
      });

      return updatedKyc;
    });
  }

  async requestCorrection(id: string, adminProfileId: string, reason: string) {
    return this.prisma.$transaction(async (tx) => {
      const kyc = await tx.kyc.findUnique({ where: { id } });

      if (!kyc) {
        return null;
      }

      if (kyc.status !== 'SOUMIS' && kyc.status !== 'EN_ATTENTE') {
        return { conflict: true, currentStatus: kyc.status } as const;
      }

      const updatedKyc = await tx.kyc.update({
        where: { id },
        data: {
          status: 'CORRECTION_REQUISE',
          reviewedAt: new Date(),
          reviewedByAdminId: adminProfileId,
          rejectionReason: reason,
        },
      });

      await tx.kycReviewHistory.create({
        data: {
          kycId: id,
          adminId: adminProfileId,
          action: 'DEMANDE_CORRECTION',
          reason,
        },
      });

      return updatedKyc;
    });
  }
}


