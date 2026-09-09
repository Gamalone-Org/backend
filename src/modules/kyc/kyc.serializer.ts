import type { AdminAccessLevel, Kyc, KycDocument, KycReviewHistory, Prisma } from '../../generated/prisma/client.js';
import { ANONYMIZED_JSON_MARKER } from '../../config/kyc.js';

type KycWithRelations = Kyc & {
  user?: {
    id: string;
    nom?: string | null;
    telephone?: string | null;
    email?: string | null;
    role: string;
    statut: string;
    telephoneVerificationStatus?: string;
    createdAt?: Date;
    artisanProfile?: {
      id: string;
      nomAtelier: string;
      specialite: string;
      localisation: string;
      estCertifie: boolean;
      scoreFiabilite: Prisma.Decimal | null;
    } | null;
  } | null;
  documents?: Array<{ id: string; documentType: string; createdAt: Date }>;
  previousSubmission?: Pick<Kyc, 'id' | 'status' | 'submittedAt' | 'reviewedAt' | 'rejectionReason'> | null;
  reviewHistory?: Array<
    KycReviewHistory & {
      admin?: {
        id: string;
        departement: string;
        niveauAcces: AdminAccessLevel;
        user?: { email: string | null; telephone: string } | null;
      } | null;
    }
  >;
};

export function toPublicKycDto(kyc: Kyc) {
  const base = {
    id: kyc.id,
    userId: kyc.userId,
    status: kyc.status,
    submittedAt: kyc.submittedAt,
    reviewedAt: kyc.reviewedAt,
    resubmissionOfId: kyc.resubmissionOfId,
    retentionUntil: kyc.retentionUntil,
    legalHold: kyc.legalHold,
    anonymizedAt: kyc.anonymizedAt,
    createdAt: kyc.createdAt,
    updatedAt: kyc.updatedAt,
  };

  if (kyc.anonymizedAt) {
    return {
      ...base,
      rejectionReason: kyc.rejectionReason ? '[anonymized]' : null,
      identityData: ANONYMIZED_JSON_MARKER,
      professionData: ANONYMIZED_JSON_MARKER,
      additionalInfo: ANONYMIZED_JSON_MARKER,
      addressData: ANONYMIZED_JSON_MARKER,
      identityDocument: ANONYMIZED_JSON_MARKER,
      supportingDocs: ANONYMIZED_JSON_MARKER,
    };
  }

  return {
    ...base,
    rejectionReason: kyc.rejectionReason,
    identityData: kyc.identityData,
    professionData: kyc.professionData,
    additionalInfo: kyc.additionalInfo,
    addressData: kyc.addressData,
    identityDocument: kyc.identityDocument,
    supportingDocs: kyc.supportingDocs,
  };
}

export function toAdminKycSummaryDto(kyc: KycWithRelations) {
  return {
    id: kyc.id,
    userId: kyc.userId,
    status: kyc.status,
    submittedAt: kyc.submittedAt,
    reviewedAt: kyc.reviewedAt,
    rejectionReason: kyc.rejectionReason,
    resubmissionOfId: kyc.resubmissionOfId,
    retentionUntil: kyc.retentionUntil,
    legalHold: kyc.legalHold,
    anonymizedAt: kyc.anonymizedAt,
    createdAt: kyc.createdAt,
    updatedAt: kyc.updatedAt,
    user: kyc.user
      ? {
          id: kyc.user.id,
          role: kyc.user.role,
          statut: kyc.user.statut,
          telephoneVerificationStatus: kyc.user.telephoneVerificationStatus,
        }
      : undefined,
    documents: kyc.documents?.map((doc) => ({
      id: doc.id,
      documentType: doc.documentType,
      createdAt: doc.createdAt,
    })),
  };
}

export function toAdminKycDetailDto(
  kyc: KycWithRelations,
  documents: Array<{
    id: string;
    kycId: string;
    documentType: string;
    resourceType: string;
    format: string | null;
    bytes: number;
    createdAt: Date;
    updatedAt: Date;
    downloadUrl: string;
  }>
) {
  return {
    ...toPublicKycDto(kyc),
    user: kyc.user
      ? {
          id: kyc.user.id,
          nom: kyc.user.nom,
          role: kyc.user.role,
          statut: kyc.user.statut,
          telephoneVerificationStatus: kyc.user.telephoneVerificationStatus,
          email: kyc.user.email,
          telephone: kyc.user.telephone,
          createdAt: kyc.user.createdAt,
          artisanProfile: kyc.user.artisanProfile,
        }
      : undefined,
    documents,
    previousSubmission: kyc.previousSubmission ?? null,
    reviewHistory: kyc.reviewHistory?.map(toReviewHistoryDto) ?? [],
  };
}

export function toReviewHistoryDto(
  entry: KycReviewHistory & {
    admin?: {
      id: string;
      departement: string;
      niveauAcces: AdminAccessLevel;
      user?: { email: string | null; telephone: string } | null;
    } | null;
  }
) {
  return {
    id: entry.id,
    kycId: entry.kycId,
    action: entry.action,
    reason: entry.reason,
    createdAt: entry.createdAt,
    admin: {
      profileId: entry.adminProfileIdSnapshot ?? entry.admin?.id ?? null,
      departement: entry.adminDepartementSnapshot ?? entry.admin?.departement ?? null,
      niveauAcces: entry.adminNiveauAccesSnapshot ?? entry.admin?.niveauAcces ?? null,
    },
  };
}

export function toPublicDocumentDto(
  doc: Pick<
    KycDocument,
    'id' | 'kycId' | 'documentType' | 'resourceType' | 'format' | 'bytes' | 'createdAt' | 'updatedAt'
  > & { downloadUrl: string }
) {
  return {
    id: doc.id,
    kycId: doc.kycId,
    documentType: doc.documentType,
    resourceType: doc.resourceType,
    format: doc.format,
    bytes: doc.bytes,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    downloadUrl: doc.downloadUrl,
  };
}
