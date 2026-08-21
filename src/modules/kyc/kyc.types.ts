import type { KycDocumentType, KycReviewAction, KycStatus } from '../../../generated/prisma/client.js';

export type KycJsonData = Record<string, unknown>;

export type SubmitKycInput = {
  identityData: KycJsonData;
  professionData?: KycJsonData;
  additionalInfo?: KycJsonData;
  addressData: KycJsonData;
  identityDocument: KycJsonData;
  supportingDocs?: KycJsonData;
};

export type KycRecord = {
  id: string;
  userId: string;
  status: KycStatus;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  reviewedByAdminId: string | null;
  rejectionReason: string | null;
  resubmissionOfId: string | null;
  identityData: unknown;
  professionData: unknown;
  additionalInfo: unknown;
  addressData: unknown;
  identityDocument: unknown;
  supportingDocs: unknown;
  createdAt: Date;
  updatedAt: Date;
};

export type KycActor = {
  id: string;
  role: string;
};

export type CreateKycDocumentData = {
  documentType: KycDocumentType;
  secureUrl: string;
  publicId: string;
  resourceType: string;
  format: string | null;
  bytes: number;
  assetId?: string | null;
};

export type KycUploadedFile = {
  buffer: Buffer;
  size?: number;
  mimetype?: string;
  originalname?: string;
};

export type KycDocumentRecord = {
  id: string;
  kycId: string;
  documentType: KycDocumentType;
  resourceType: string;
  format: string | null;
  bytes: number;
  createdAt: Date;
  updatedAt: Date;
};

export type AdminKycListQuery = {
  page?: number;
  limit?: number;
  status?: KycStatus;
};

export type AdminReviewReasonInput = {
  reason: string;
};

export type KycReviewHistoryRecord = {
  id: string;
  kycId: string;
  adminId: string;
  action: KycReviewAction;
  reason: string | null;
  createdAt: Date;
};



