import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../common/errors/AppError.js';
import type { CloudinaryResourceType } from '../../shared/services/cloudinary/index.js';
import { CloudinaryService } from '../../shared/services/cloudinary/index.js';
import { logKycError, logKycInfo } from './kyc-logger.js';
import { KycPrivacyRepository } from './kyc-privacy.repository.js';

export type AnonymizeKycResult = {
  kycId: string;
  anonymizedAt: Date;
  documentsProcessed: number;
  alreadyAnonymized: boolean;
};

export class KycPrivacyService {
  constructor(
    private readonly repository: KycPrivacyRepository,
    private readonly cloudinaryService: CloudinaryService = new CloudinaryService()
  ) {}

  async anonymizeKyc(kycId: string, options?: { force?: boolean }): Promise<AnonymizeKycResult> {
    const kyc = await this.repository.findKycById(kycId);
    if (!kyc) {
      throw new NotFoundError('KYC record not found');
    }

    if (kyc.anonymizedAt) {
      return {
        kycId: kyc.id,
        anonymizedAt: kyc.anonymizedAt,
        documentsProcessed: 0,
        alreadyAnonymized: true,
      };
    }

    if (kyc.legalHold) {
      throw new ForbiddenError('KYC record is under legal hold and cannot be anonymized');
    }

    const now = new Date();
    if (!options?.force && kyc.retentionUntil && kyc.retentionUntil > now) {
      throw new ValidationError('KYC retention period has not expired yet');
    }

    const txResult = await this.repository.anonymizeKycRecord(kycId, { force: options?.force });
    if (!txResult) {
      throw new NotFoundError('KYC record not found');
    }

    if ('legalHoldBlocked' in txResult) {
      throw new ForbiddenError('KYC record is under legal hold and cannot be anonymized');
    }

    if ('retentionNotReached' in txResult) {
      throw new ValidationError('KYC retention period has not expired yet');
    }

    if (txResult.alreadyAnonymized) {
      return {
        kycId: txResult.id,
        anonymizedAt: txResult.anonymizedAt!,
        documentsProcessed: 0,
        alreadyAnonymized: true,
      };
    }

    const documents = txResult.documents ?? [];
    let documentsProcessed = 0;

    for (const document of documents) {
      if (document.anonymizedAt || document.deletedAt) {
        continue;
      }

      try {
        await this.cloudinaryService.deleteAsset(
          document.publicId,
          document.resourceType as CloudinaryResourceType
        );
      } catch (error) {
        logKycError('kyc_document_cloudinary_delete_failed', {
          kycId,
          documentId: document.id,
          errorCode: error instanceof Error ? error.name : 'UNKNOWN',
        });
        throw new ConflictError(
          'Failed to delete KYC document from storage; anonymization aborted to preserve consistency'
        );
      }

      await this.repository.markDocumentAnonymized(document.id);
      documentsProcessed += 1;
    }

    logKycInfo('kyc_anonymized', { kycId, documentCount: documentsProcessed });

    return {
      kycId: txResult.id,
      anonymizedAt: txResult.anonymizedAt!,
      documentsProcessed,
      alreadyAnonymized: false,
    };
  }

  async setLegalHold(kycId: string, legalHold: boolean) {
    const kyc = await this.repository.findKycById(kycId);
    if (!kyc) {
      throw new NotFoundError('KYC record not found');
    }

    const updated = await this.repository.setLegalHold(kycId, legalHold);
    logKycInfo(legalHold ? 'kyc_legal_hold_enabled' : 'kyc_legal_hold_disabled', { kycId });
    return updated;
  }
}
