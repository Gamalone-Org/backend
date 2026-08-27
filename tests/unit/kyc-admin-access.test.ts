import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError, UnauthorizedError } from '../../src/common/errors/AppError.js';
import { createKycServiceForTest, superAdminActor, moderatorAdminActor, supportAdminActor } from './kyc-test-helpers.js';
import { KycService } from '../../src/modules/kyc/kyc.service.js';

function createRepository() {
  return {
    findUserPhoneVerification: vi.fn(),
    findAdminProfileByUserId: vi.fn(),
    findActiveByUserId: vi.fn(),
    findLatestByUserId: vi.fn(),
    findById: vi.fn(),
    findPendingReviews: vi.fn(),
    findAdminDetailsById: vi.fn(),
    findReviewHistoryByKycId: vi.fn(),
    createSubmission: vi.fn(),
    createResubmission: vi.fn(),
    approveSubmission: vi.fn(),
    rejectSubmission: vi.fn(),
    requestCorrection: vi.fn(),
    createDocument: vi.fn(),
    findDocumentsByKycId: vi.fn(),
    findDocumentById: vi.fn(),
    deleteDocument: vi.fn(),
  };
}

const buyerActor = { id: 'buyer-1', role: 'ACHETEUR' };
const plainUserActor = { id: 'user-1', role: 'ACHETEUR' };
const noLevelAdmin = { id: 'admin-1', role: 'ADMIN', adminProfileId: null, adminAccessLevel: null };

describe('AdminAccessLevel enforcement', () => {
  let repository: ReturnType<typeof createRepository>;
  let service: KycService;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = createRepository();
    service = createKycServiceForTest(repository);
  });

  describe('SUPPORT-level operations', () => {
    it('allows SUPPORT to list pending reviews', async () => {
      repository.findPendingReviews.mockResolvedValue({ data: [], pagination: { page: 1, limit: 10, total: 0, totalPages: 1 } });
      const result = await service.listPendingReviews(supportAdminActor, {});
      expect(result).toBeDefined();
    });

    it('rejects non-admin for list pending reviews', async () => {
      await expect(service.listPendingReviews(buyerActor, {})).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('rejects admin with null access level for list pending reviews', async () => {
      await expect(service.listPendingReviews(noLevelAdmin, {})).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('allows SUPPORT to get admin details', async () => {
      repository.findAdminDetailsById.mockResolvedValue({
        id: 'kyc-1', userId: 'u1', status: 'SOUMIS', documents: [], reviewHistory: [],
      });
      const result = await service.getAdminDetailsById('kyc-1', supportAdminActor);
      expect(result).toBeDefined();
    });

    it('allows SUPPORT to get review history', async () => {
      repository.findById.mockResolvedValue({ id: 'kyc-1' });
      repository.findReviewHistoryByKycId.mockResolvedValue([]);
      const result = await service.getReviewHistory('kyc-1', supportAdminActor);
      expect(result).toEqual([]);
    });
  });

  describe('MODERATEUR-level operations', () => {
    it('allows MODERATEUR to approve KYC', async () => {
      repository.findAdminProfileByUserId.mockResolvedValue({ id: 'admin-profile-1' });
      repository.findById.mockResolvedValue({ id: 'kyc-1', status: 'SOUMIS' });
      repository.approveSubmission.mockResolvedValue({ id: 'kyc-1', status: 'VALIDE' });

      const result = await service.approveKyc('kyc-1', moderatorAdminActor);
      expect(result).toBeDefined();
    });

    it('rejects SUPPORT for approve KYC', async () => {
      await expect(service.approveKyc('kyc-1', supportAdminActor)).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('rejects non-admin for approve KYC', async () => {
      await expect(service.approveKyc('kyc-1', plainUserActor)).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('allows MODERATEUR to reject KYC', async () => {
      repository.findAdminProfileByUserId.mockResolvedValue({ id: 'admin-profile-1' });
      repository.findById.mockResolvedValue({ id: 'kyc-1', status: 'SOUMIS' });
      repository.rejectSubmission.mockResolvedValue({ id: 'kyc-1', status: 'REJETE' });

      const result = await service.rejectKyc('kyc-1', moderatorAdminActor, 'Invalid docs');
      expect(result).toBeDefined();
    });

    it('rejects SUPPORT for reject KYC', async () => {
      await expect(service.rejectKyc('kyc-1', supportAdminActor, 'reason')).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('allows MODERATEUR to request correction', async () => {
      repository.findAdminProfileByUserId.mockResolvedValue({ id: 'admin-profile-1' });
      repository.findById.mockResolvedValue({ id: 'kyc-1', status: 'SOUMIS' });
      repository.requestCorrection.mockResolvedValue({ id: 'kyc-1', status: 'CORRECTION_REQUISE' });

      const result = await service.requestKycCorrection('kyc-1', moderatorAdminActor, 'Please fix');
      expect(result).toBeDefined();
    });

    it('rejects SUPPORT for request correction', async () => {
      await expect(service.requestKycCorrection('kyc-1', supportAdminActor, 'fix')).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('allows MODERATEUR to get documents', async () => {
      repository.findById.mockResolvedValue({ id: 'kyc-1', userId: 'u1', anonymizedAt: null });
      repository.findDocumentsByKycId.mockResolvedValue([]);
      const result = await service.getDocuments('kyc-1', moderatorAdminActor);
      expect(result).toEqual([]);
    });

    it('allows MODERATEUR to delete documents', async () => {
      repository.findById.mockResolvedValue({
        id: 'kyc-1', userId: 'u1', status: 'SOUMIS', legalHold: false, anonymizedAt: null,
      });
      repository.findDocumentById.mockResolvedValue({ id: 'doc-1', kycId: 'kyc-1', publicId: 'gamalone/kyc/doc', resourceType: 'raw', deletedAt: null });

      const mockCloudinary = { deleteAsset: vi.fn().mockResolvedValue(undefined) };
      repository.deleteDocument = vi.fn().mockResolvedValue(undefined);
      const svc = createKycServiceForTest(repository, mockCloudinary);

      const result = await svc.deleteDocument('kyc-1', 'doc-1', moderatorAdminActor);
      expect(result.success).toBe(true);
    });
  });

  describe('SUPER_ADMIN-level operations', () => {
    it('allows SUPER_ADMIN to set legal hold', async () => {
      const mockPrivacyService = { setLegalHold: vi.fn().mockResolvedValue({ id: 'kyc-1', legalHold: true }) };
      const svc = createKycServiceForTest(repository, undefined, mockPrivacyService as any);

      const result = await svc.setLegalHold('kyc-1', superAdminActor, true);
      expect(result.legalHold).toBe(true);
    });

    it('rejects MODERATEUR for set legal hold', async () => {
      await expect(service.setLegalHold('kyc-1', moderatorAdminActor, true)).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('rejects SUPPORT for set legal hold', async () => {
      await expect(service.setLegalHold('kyc-1', supportAdminActor, true)).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('rejects non-admin for set legal hold', async () => {
      await expect(service.setLegalHold('kyc-1', plainUserActor, true)).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('allows SUPER_ADMIN to anonymize KYC', async () => {
      const mockPrivacyService = {
        anonymizeKyc: vi.fn().mockResolvedValue({ kycId: 'kyc-1', alreadyAnonymized: false }),
      };
      const svc = createKycServiceForTest(repository, undefined, mockPrivacyService as any);

      const result = await svc.anonymizeKyc('kyc-1', superAdminActor);
      expect(result).toBeDefined();
    });

    it('rejects MODERATEUR for anonymize KYC', async () => {
      await expect(service.anonymizeKyc('kyc-1', moderatorAdminActor)).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('allows SUPER_ADMIN to run purge', async () => {
      const mockPurgeService = {
        runPurge: vi.fn().mockResolvedValue({ scanned: 0, anonymized: 0, skipped: 0, failed: 0 }),
      };
      const svc = createKycServiceForTest(repository, undefined, undefined, mockPurgeService as any);

      const result = await svc.runPurge(superAdminActor);
      expect(result.scanned).toBe(0);
    });

    it('rejects MODERATEUR for run purge', async () => {
      await expect(service.runPurge(moderatorAdminActor)).rejects.toBeInstanceOf(ForbiddenError);
    });
  });
});
