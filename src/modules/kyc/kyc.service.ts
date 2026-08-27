import type { AdminAccessLevel, KycDocumentType, KycStatus } from '../../generated/prisma/client.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../common/errors/AppError.js';
import { hasMinAdminAccessLevel, kycConfig } from '../../config/kyc.js';
import type { CloudinaryResourceType } from '../../shared/services/cloudinary/index.js';
import { CloudinaryService } from '../../shared/services/cloudinary/index.js';
import { detectMimeTypeFromMagicBytes } from './middleware/kyc-upload.middleware.js';
import { logKycError } from './kyc-logger.js';
import { KycPrivacyService } from './kyc-privacy.service.js';
import { KycPurgeService } from './kyc-purge.service.js';
import { KycRepository } from './kyc.repository.js';
import {
  toAdminKycDetailDto,
  toAdminKycSummaryDto,
  toPublicDocumentDto,
  toPublicKycDto,
  toReviewHistoryDto,
} from './kyc.serializer.js';
import type { AdminKycListQuery, KycActor, KycUploadedFile, SubmitKycInput } from './kyc.types.js';

const allowedTransitions: Record<KycStatus, readonly KycStatus[]> = {
  BROUILLON: ['SOUMIS'],
  SOUMIS: ['EN_ATTENTE', 'VALIDE', 'REJETE', 'CORRECTION_REQUISE'],
  EN_ATTENTE: ['VALIDE', 'REJETE', 'CORRECTION_REQUISE'],
  VALIDE: [],
  REJETE: [],
  CORRECTION_REQUISE: ['SOUMIS'],
  EXPIRE: [],
};

const allowedUploadStatuses: readonly KycStatus[] = [
  'BROUILLON',
  'SOUMIS',
  'EN_ATTENTE',
  'CORRECTION_REQUISE',
];

const terminalKycStatuses: readonly KycStatus[] = ['VALIDE', 'REJETE', 'EXPIRE'];

export class KycService {
  constructor(
    private readonly repository: KycRepository,
    private readonly cloudinaryService: CloudinaryService = new CloudinaryService(),
    private readonly privacyService: KycPrivacyService,
    private readonly purgeService: KycPurgeService
  ) {}

  private assertAdminAccess(actor: KycActor, minimumLevel: AdminAccessLevel): void {
    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Admin access required');
    }

    if (!hasMinAdminAccessLevel(actor.adminAccessLevel, minimumLevel)) {
      throw new ForbiddenError('Insufficient admin access level');
    }
  }

  private async resolveAdminProfileId(actor: KycActor): Promise<string> {
    if (actor.adminProfileId) {
      return actor.adminProfileId;
    }

    const adminProfile = await this.repository.findAdminProfileByUserId(actor.id);
    if (!adminProfile) {
      throw new ForbiddenError('Admin profile not found');
    }

    return adminProfile.id;
  }

  private generateSignedDocumentUrl(publicId: string, resourceType: CloudinaryResourceType): string {
    return this.cloudinaryService.generateSignedUrl(
      publicId,
      resourceType,
      kycConfig.signedUrlTtlSeconds
    );
  }

  async submit(userId: string, input: SubmitKycInput) {
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const user = await this.repository.findUserPhoneVerification(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (user.telephoneVerificationStatus !== 'VERIFIE') {
      throw new ForbiddenError('Phone verification is required before KYC submission');
    }

    const activeKyc = await this.repository.findActiveByUserId(userId);
    if (activeKyc) {
      throw new ConflictError('An active KYC submission already exists');
    }

    const latestKyc = await this.repository.findLatestByUserId(userId);
    if (latestKyc && (latestKyc.status === 'REJETE' || latestKyc.status === 'EXPIRE')) {
      throw new ConflictError(
        'A previous KYC was rejected or expired; please use /resubmit to link your new submission'
      );
    }

    const kyc = await this.repository.createSubmission(userId, input);
    return toPublicKycDto(kyc);
  }

  async resubmit(userId: string, input: SubmitKycInput) {
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const user = await this.repository.findUserPhoneVerification(userId);
    if (!user) {
      throw new NotFoundError('User not found');
    }

    if (user.telephoneVerificationStatus !== 'VERIFIE') {
      throw new ForbiddenError('Phone verification is required before KYC submission');
    }

    const latestKyc = await this.repository.findLatestByUserId(userId);
    if (!latestKyc) {
      throw new NotFoundError('KYC record not found');
    }

    if (latestKyc.status !== 'CORRECTION_REQUISE') {
      throw new ForbiddenError('Resubmission is only allowed for KYC in CORRECTION_REQUISE status');
    }

    this.validateStatusTransition(latestKyc.status, 'SOUMIS');

    const kyc = await this.repository.createResubmission(userId, latestKyc.id, input);
    return toPublicKycDto(kyc);
  }

  async getMyKyc(userId: string) {
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const kyc = await this.repository.findLatestByUserId(userId);
    if (!kyc) {
      throw new NotFoundError('KYC record not found');
    }

    return toPublicKycDto(kyc);
  }

  async getById(id: string, actor: KycActor) {
    const kyc = await this.repository.findById(id);
    if (!kyc) {
      throw new NotFoundError('KYC record not found');
    }

    if (kyc.userId !== actor.id && actor.role !== 'ADMIN') {
      throw new ForbiddenError('You cannot access this KYC record');
    }

    if (actor.role === 'ADMIN') {
      this.assertAdminAccess(actor, 'SUPPORT');
    }

    return toPublicKycDto(kyc);
  }

  async uploadDocument(
    kycId: string,
    actorId: string,
    documentType: KycDocumentType,
    file?: KycUploadedFile
  ) {
    if (!actorId) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!file || !file.buffer || file.buffer.length === 0) {
      throw new ValidationError('File is required');
    }

    const kyc = await this.repository.findById(kycId);
    if (!kyc) {
      throw new NotFoundError('KYC record not found');
    }

    if (kyc.userId !== actorId) {
      throw new ForbiddenError('You cannot upload documents to this KYC record');
    }

    if (kyc.legalHold) {
      throw new ForbiddenError('KYC record is under legal hold');
    }

    if (kyc.anonymizedAt) {
      throw new ForbiddenError('KYC record has been anonymized');
    }

    const user = await this.repository.findUserPhoneVerification(actorId);
    if (!user || user.telephoneVerificationStatus !== 'VERIFIE') {
      throw new ForbiddenError('Phone verification is required before uploading KYC documents');
    }

    if (!allowedUploadStatuses.includes(kyc.status)) {
      throw new ForbiddenError(`Cannot upload documents to a KYC record with status ${kyc.status}`);
    }

    const detectedMime = detectMimeTypeFromMagicBytes(file.buffer);
    if (!detectedMime) {
      throw new ValidationError('Invalid or unsupported file content. Allowed formats: PDF, JPEG, PNG');
    }

    const uploadResult = await this.cloudinaryService.uploadDocument(file.buffer, {
      domain: 'kyc',
      mimeType: detectedMime,
      bytes: file.buffer.length,
    });

    try {
      const createdDocument = await this.repository.createDocument(
        kycId,
        {
          documentType,
          secureUrl: uploadResult.secureUrl,
          publicId: uploadResult.publicId,
          resourceType: uploadResult.resourceType,
          format: uploadResult.format,
          bytes: uploadResult.bytes,
          assetId: uploadResult.assetId,
        },
        kyc.retentionUntil
      );

      return toPublicDocumentDto({
        id: createdDocument.id,
        kycId: createdDocument.kycId,
        documentType: createdDocument.documentType,
        resourceType: createdDocument.resourceType,
        format: createdDocument.format,
        bytes: createdDocument.bytes,
        createdAt: createdDocument.createdAt,
        updatedAt: createdDocument.updatedAt,
        downloadUrl: this.generateSignedDocumentUrl(
          uploadResult.publicId,
          uploadResult.resourceType as CloudinaryResourceType
        ),
      });
    } catch (dbError) {
      try {
        await this.cloudinaryService.deleteAsset(uploadResult.publicId, 'raw');
      } catch {
        logKycError('kyc_upload_cloudinary_rollback_failed', {
          kycId,
        });
      }
      throw dbError;
    }
  }

  async getDocuments(kycId: string, actor: KycActor) {
    if (!actor.id) {
      throw new UnauthorizedError('Authentication required');
    }

    const kyc = await this.repository.findById(kycId);
    if (!kyc) {
      throw new NotFoundError('KYC record not found');
    }

    if (kyc.userId !== actor.id && actor.role !== 'ADMIN') {
      throw new ForbiddenError('You cannot access documents for this KYC record');
    }

    if (actor.role === 'ADMIN') {
      this.assertAdminAccess(actor, 'MODERATEUR');
    }

    if (kyc.anonymizedAt) {
      return [];
    }

    const documents = await this.repository.findDocumentsByKycId(kycId);

    return documents.map((doc) =>
      toPublicDocumentDto({
        id: doc.id,
        kycId: doc.kycId,
        documentType: doc.documentType,
        resourceType: doc.resourceType,
        format: doc.format,
        bytes: doc.bytes,
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
        downloadUrl: this.generateSignedDocumentUrl(
          doc.publicId,
          doc.resourceType as CloudinaryResourceType
        ),
      })
    );
  }

  async deleteDocument(kycId: string, documentId: string, actor: KycActor) {
    if (!actor.id) {
      throw new UnauthorizedError('Authentication required');
    }

    const kyc = await this.repository.findById(kycId);
    if (!kyc) {
      throw new NotFoundError('KYC record not found');
    }

    const isOwner = kyc.userId === actor.id;
    const isAdmin = actor.role === 'ADMIN';

    if (!isOwner && !isAdmin) {
      throw new ForbiddenError('You cannot delete documents from this KYC record');
    }

    if (isAdmin) {
      this.assertAdminAccess(actor, 'MODERATEUR');
    }

    if (kyc.legalHold) {
      throw new ForbiddenError('KYC record is under legal hold');
    }

    if (kyc.anonymizedAt) {
      throw new ForbiddenError('KYC record has been anonymized');
    }

    if (terminalKycStatuses.includes(kyc.status)) {
      throw new ForbiddenError(`Cannot delete documents from a KYC record with status ${kyc.status}`);
    }

    const document = await this.repository.findDocumentById(documentId);
    if (!document || document.kycId !== kycId || document.deletedAt) {
      throw new NotFoundError('KYC document not found');
    }

    await this.cloudinaryService.deleteAsset(
      document.publicId,
      document.resourceType as CloudinaryResourceType
    );

    await this.repository.deleteDocument(documentId);

    return { success: true, message: 'KYC document deleted successfully' };
  }

  validateStatusTransition(from: KycStatus, to: KycStatus): void {
    if (!allowedTransitions[from]?.includes(to)) {
      throw new ValidationError(`Invalid KYC status transition: ${from} -> ${to}`);
    }
  }

  async listPendingReviews(actor: KycActor, query: AdminKycListQuery) {
    if (!actor.id) {
      throw new UnauthorizedError('Authentication required');
    }

    this.assertAdminAccess(actor, 'SUPPORT');

    const result = await this.repository.findPendingReviews(query);
    return {
      data: result.data.map((item) => toAdminKycSummaryDto(item)),
      pagination: result.pagination,
    };
  }

  async getAdminDetailsById(id: string, actor: KycActor) {
    if (!actor.id) {
      throw new UnauthorizedError('Authentication required');
    }

    this.assertAdminAccess(actor, 'SUPPORT');

    const kyc = await this.repository.findAdminDetailsById(id);
    if (!kyc) {
      throw new NotFoundError('KYC record not found');
    }

    const documents =
      actor.adminAccessLevel && hasMinAdminAccessLevel(actor.adminAccessLevel, 'MODERATEUR') && !kyc.anonymizedAt
        ? kyc.documents
            .filter((doc) => !doc.deletedAt)
            .map((doc) =>
              toPublicDocumentDto({
                id: doc.id,
                kycId: doc.kycId,
                documentType: doc.documentType,
                resourceType: doc.resourceType,
                format: doc.format,
                bytes: doc.bytes,
                createdAt: doc.createdAt,
                updatedAt: doc.updatedAt,
                downloadUrl: this.generateSignedDocumentUrl(
                  doc.publicId,
                  doc.resourceType as CloudinaryResourceType
                ),
              })
            )
        : [];

    return toAdminKycDetailDto(kyc, documents);
  }

  async getReviewHistory(kycId: string, actor: KycActor) {
    if (!actor.id) {
      throw new UnauthorizedError('Authentication required');
    }

    this.assertAdminAccess(actor, 'SUPPORT');

    const kyc = await this.repository.findById(kycId);
    if (!kyc) {
      throw new NotFoundError('KYC record not found');
    }

    const history = await this.repository.findReviewHistoryByKycId(kycId);
    return history.map(toReviewHistoryDto);
  }

  async approveKyc(id: string, actor: KycActor) {
    if (!actor.id) {
      throw new UnauthorizedError('Authentication required');
    }

    this.assertAdminAccess(actor, 'MODERATEUR');

    const adminProfileId = await this.resolveAdminProfileId(actor);

    const kyc = await this.repository.findById(id);
    if (!kyc) {
      throw new NotFoundError('KYC record not found');
    }

    this.validateStatusTransition(kyc.status, 'VALIDE');

    const result = await this.repository.approveSubmission(id, adminProfileId);
    if (!result) {
      throw new NotFoundError('KYC record not found');
    }

    if ('conflict' in result) {
      throw new ConflictError('KYC record has already been reviewed or status is invalid');
    }

    return toPublicKycDto(result);
  }

  async rejectKyc(id: string, actor: KycActor, reason: string) {
    if (!actor.id) {
      throw new UnauthorizedError('Authentication required');
    }

    this.assertAdminAccess(actor, 'MODERATEUR');

    if (!reason || !reason.trim()) {
      throw new ValidationError('Rejection reason is required');
    }

    const adminProfileId = await this.resolveAdminProfileId(actor);

    const kyc = await this.repository.findById(id);
    if (!kyc) {
      throw new NotFoundError('KYC record not found');
    }

    this.validateStatusTransition(kyc.status, 'REJETE');

    const result = await this.repository.rejectSubmission(id, adminProfileId, reason.trim());
    if (!result) {
      throw new NotFoundError('KYC record not found');
    }

    if ('conflict' in result) {
      throw new ConflictError('KYC record has already been reviewed or status is invalid');
    }

    return toPublicKycDto(result);
  }

  async requestKycCorrection(id: string, actor: KycActor, reason: string) {
    if (!actor.id) {
      throw new UnauthorizedError('Authentication required');
    }

    this.assertAdminAccess(actor, 'MODERATEUR');

    if (!reason || !reason.trim()) {
      throw new ValidationError('Correction reason is required');
    }

    const adminProfileId = await this.resolveAdminProfileId(actor);

    const kyc = await this.repository.findById(id);
    if (!kyc) {
      throw new NotFoundError('KYC record not found');
    }

    this.validateStatusTransition(kyc.status, 'CORRECTION_REQUISE');

    const result = await this.repository.requestCorrection(id, adminProfileId, reason.trim());
    if (!result) {
      throw new NotFoundError('KYC record not found');
    }

    if ('conflict' in result) {
      throw new ConflictError('KYC record has already been reviewed or status is invalid');
    }

    return toPublicKycDto(result);
  }

  async setLegalHold(kycId: string, actor: KycActor, legalHold: boolean) {
    this.assertAdminAccess(actor, 'SUPER_ADMIN');

    const updated = await this.privacyService.setLegalHold(kycId, legalHold);
    return toPublicKycDto(updated);
  }

  async anonymizeKyc(kycId: string, actor: KycActor, force = false) {
    this.assertAdminAccess(actor, 'SUPER_ADMIN');

    const result = await this.privacyService.anonymizeKyc(kycId, { force });
    return result;
  }

  async runPurge(actor: KycActor) {
    this.assertAdminAccess(actor, 'SUPER_ADMIN');
    return this.purgeService.runPurge();
  }
}
