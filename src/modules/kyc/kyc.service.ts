import type { KycDocumentType, KycStatus } from '../../generated/prisma/client.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../common/errors/AppError.js';
import type { CloudinaryResourceType } from '../../shared/services/cloudinary/index.js';
import { CloudinaryService } from '../../shared/services/cloudinary/index.js';
import { detectMimeTypeFromMagicBytes } from './middleware/kyc-upload.middleware.js';
import { KycRepository } from './kyc.repository.js';
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

export class KycService {
  private _cloudinaryService?: CloudinaryService;

  constructor(
    private readonly repository: KycRepository,
    cloudinaryService?: CloudinaryService
  ) {
    this._cloudinaryService = cloudinaryService;
  }

  private getCloudinaryService(): CloudinaryService {
    if (!this._cloudinaryService) {
      this._cloudinaryService = new CloudinaryService();
    }
    return this._cloudinaryService;
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

    return this.repository.createSubmission(userId, input);
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
      this.validateStatusTransition(latestKyc.status, 'SOUMIS');
      throw new ForbiddenError('Resubmission is only allowed for KYC in CORRECTION_REQUISE status');
    }

    this.validateStatusTransition(latestKyc.status, 'SOUMIS');

    return this.repository.createResubmission(userId, latestKyc.id, input);
  }

  async getMyKyc(userId: string) {
    if (!userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const kyc = await this.repository.findLatestByUserId(userId);
    if (!kyc) {
      throw new NotFoundError('KYC record not found');
    }

    return kyc;
  }

  async getById(id: string, actor: KycActor) {
    const kyc = await this.repository.findById(id);
    if (!kyc) {
      throw new NotFoundError('KYC record not found');
    }

    if (kyc.userId !== actor.id && actor.role !== 'ADMIN') {
      throw new ForbiddenError('You cannot access this KYC record');
    }

    return kyc;
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

    const cloudinaryService = this.getCloudinaryService();

    const uploadResult = await cloudinaryService.uploadDocument(file.buffer, {
      domain: 'kyc',
      mimeType: detectedMime,
      bytes: file.buffer.length,
    });

    try {
      const createdDocument = await this.repository.createDocument(kycId, {
        documentType,
        secureUrl: uploadResult.secureUrl,
        publicId: uploadResult.publicId,
        resourceType: uploadResult.resourceType,
        format: uploadResult.format,
        bytes: uploadResult.bytes,
        assetId: uploadResult.assetId,
      });

      return {
        id: createdDocument.id,
        kycId: createdDocument.kycId,
        documentType: createdDocument.documentType,
        resourceType: createdDocument.resourceType,
        format: createdDocument.format,
        bytes: createdDocument.bytes,
        createdAt: createdDocument.createdAt,
        updatedAt: createdDocument.updatedAt,
      };
    } catch (dbError) {
      try {
        await cloudinaryService.deleteAsset(uploadResult.publicId, 'raw');
      } catch (cleanupError) {
        console.error('Failed to rollback Cloudinary asset after DB failure:', {
          publicId: uploadResult.publicId,
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

    const documents = await this.repository.findDocumentsByKycId(kycId);
    const cloudinaryService = this.getCloudinaryService();

    return documents.map((doc) => ({
      id: doc.id,
      kycId: doc.kycId,
      documentType: doc.documentType,
      resourceType: doc.resourceType,
      format: doc.format,
      bytes: doc.bytes,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      downloadUrl: cloudinaryService.generateSignedUrl(
        doc.publicId,
        doc.resourceType as CloudinaryResourceType
      ),
    }));
  }

  async deleteDocument(kycId: string, documentId: string, actor: KycActor) {
    if (!actor.id) {
      throw new UnauthorizedError('Authentication required');
    }

    const kyc = await this.repository.findById(kycId);
    if (!kyc) {
      throw new NotFoundError('KYC record not found');
    }

    if (kyc.userId !== actor.id && actor.role !== 'ADMIN') {
      throw new ForbiddenError('You cannot delete documents from this KYC record');
    }

    const document = await this.repository.findDocumentById(documentId);
    if (!document || document.kycId !== kycId) {
      throw new NotFoundError('KYC document not found');
    }

    const cloudinaryService = this.getCloudinaryService();

    await cloudinaryService.deleteAsset(
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

    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Admin access required');
    }

    return this.repository.findPendingReviews(query);
  }

  async getAdminDetailsById(id: string, actor: KycActor) {
    if (!actor.id) {
      throw new UnauthorizedError('Authentication required');
    }

    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Admin access required');
    }

    const kyc = await this.repository.findAdminDetailsById(id);
    if (!kyc) {
      throw new NotFoundError('KYC record not found');
    }

    const cloudinaryService = this.getCloudinaryService();
    const documents = kyc.documents.map((doc) => ({
      id: doc.id,
      kycId: doc.kycId,
      documentType: doc.documentType,
      resourceType: doc.resourceType,
      format: doc.format,
      bytes: doc.bytes,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
      downloadUrl: cloudinaryService.generateSignedUrl(
        doc.publicId,
        doc.resourceType as CloudinaryResourceType
      ),
    }));

    return {
      ...kyc,
      documents,
    };
  }

  async getReviewHistory(kycId: string, actor: KycActor) {
    if (!actor.id) {
      throw new UnauthorizedError('Authentication required');
    }

    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Admin access required');
    }

    const adminProfile = await this.repository.findAdminProfileByUserId(actor.id);
    if (!adminProfile) {
      throw new ForbiddenError('Admin profile not found');
    }

    const kyc = await this.repository.findById(kycId);
    if (!kyc) {
      throw new NotFoundError('KYC record not found');
    }

    return this.repository.findReviewHistoryByKycId(kycId);
  }

  async approveKyc(id: string, actor: KycActor) {
    if (!actor.id) {
      throw new UnauthorizedError('Authentication required');
    }

    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Admin access required');
    }

    const adminProfile = await this.repository.findAdminProfileByUserId(actor.id);
    if (!adminProfile) {
      throw new ForbiddenError('Admin profile not found');
    }

    const kyc = await this.repository.findById(id);
    if (!kyc) {
      throw new NotFoundError('KYC record not found');
    }

    this.validateStatusTransition(kyc.status, 'VALIDE');

    const result = await this.repository.approveSubmission(id, adminProfile.id);
    if (!result) {
      throw new NotFoundError('KYC record not found');
    }

    if ('conflict' in result) {
      throw new ConflictError('KYC record has already been reviewed or status is invalid');
    }

    return result;
  }

  async rejectKyc(id: string, actor: KycActor, reason: string) {
    if (!actor.id) {
      throw new UnauthorizedError('Authentication required');
    }

    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Admin access required');
    }

    if (!reason || !reason.trim()) {
      throw new ValidationError('Rejection reason is required');
    }

    const adminProfile = await this.repository.findAdminProfileByUserId(actor.id);
    if (!adminProfile) {
      throw new ForbiddenError('Admin profile not found');
    }

    const kyc = await this.repository.findById(id);
    if (!kyc) {
      throw new NotFoundError('KYC record not found');
    }

    this.validateStatusTransition(kyc.status, 'REJETE');

    const result = await this.repository.rejectSubmission(id, adminProfile.id, reason.trim());
    if (!result) {
      throw new NotFoundError('KYC record not found');
    }

    if ('conflict' in result) {
      throw new ConflictError('KYC record has already been reviewed or status is invalid');
    }

    return result;
  }

  async requestKycCorrection(id: string, actor: KycActor, reason: string) {
    if (!actor.id) {
      throw new UnauthorizedError('Authentication required');
    }

    if (actor.role !== 'ADMIN') {
      throw new ForbiddenError('Admin access required');
    }

    if (!reason || !reason.trim()) {
      throw new ValidationError('Correction reason is required');
    }

    const adminProfile = await this.repository.findAdminProfileByUserId(actor.id);
    if (!adminProfile) {
      throw new ForbiddenError('Admin profile not found');
    }

    const kyc = await this.repository.findById(id);
    if (!kyc) {
      throw new NotFoundError('KYC record not found');
    }

    this.validateStatusTransition(kyc.status, 'CORRECTION_REQUISE');

    const result = await this.repository.requestCorrection(id, adminProfile.id, reason.trim());
    if (!result) {
      throw new NotFoundError('KYC record not found');
    }

    if ('conflict' in result) {
      throw new ConflictError('KYC record has already been reviewed or status is invalid');
    }

    return result;
  }
}



