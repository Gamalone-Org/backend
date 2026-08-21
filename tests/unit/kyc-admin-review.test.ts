import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../src/common/errors/AppError.js';
import { KycService } from '../../src/modules/kyc/kyc.service.js';

function createRepository() {
  return {
    findUserPhoneVerification: vi.fn(),
    findAdminProfileByUserId: vi.fn(),
    findActiveByUserId: vi.fn(),
    findById: vi.fn(),
    findLatestByUserId: vi.fn(),
    createSubmission: vi.fn(),
    createResubmission: vi.fn(),
    createDocument: vi.fn(),
    findDocumentsByKycId: vi.fn(),
    findDocumentById: vi.fn(),
    deleteDocument: vi.fn(),
    findPendingReviews: vi.fn(),
    findAdminDetailsById: vi.fn(),
    findReviewHistoryByKycId: vi.fn(),
    approveSubmission: vi.fn(),
    rejectSubmission: vi.fn(),
    requestCorrection: vi.fn(),
  };
}

function createCloudinaryService() {
  return {
    uploadKycDocument: vi.fn(),
    generateSignedUrl: vi.fn((publicId: string) => `https://signed.cloudinary.com/${publicId}`),
    deleteAsset: vi.fn(),
  };
}

const adminActor = { id: 'admin-user-1', role: 'ADMIN' };
const buyerActor = { id: 'buyer-user-1', role: 'ACHETEUR' };

describe('KycService — Admin Review Workflow', () => {
  let repository: ReturnType<typeof createRepository>;
  let cloudinaryService: ReturnType<typeof createCloudinaryService>;
  let service: KycService;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = createRepository();
    cloudinaryService = createCloudinaryService();
    service = new KycService(repository as any, cloudinaryService as any);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 1. LISTER LES KYC À TRAITER
  // ──────────────────────────────────────────────────────────────────────────
  describe('listPendingReviews', () => {
    it('rejects when actor is not authenticated', async () => {
      await expect(
        service.listPendingReviews({ id: '', role: 'ADMIN' }, {})
      ).rejects.toBeInstanceOf(UnauthorizedError);
      expect(repository.findPendingReviews).not.toHaveBeenCalled();
    });

    it('rejects when actor role is not ADMIN', async () => {
      await expect(
        service.listPendingReviews(buyerActor, {})
      ).rejects.toBeInstanceOf(ForbiddenError);
      expect(repository.findPendingReviews).not.toHaveBeenCalled();
    });

    it('returns pending KYC submissions for admin with pagination', async () => {
      const mockResult = {
        data: [{ id: 'kyc-1', status: 'SOUMIS' }],
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
      };
      repository.findPendingReviews.mockResolvedValue(mockResult);

      const result = await service.listPendingReviews(adminActor, { page: 1, limit: 10 });
      expect(result).toEqual(mockResult);
      expect(repository.findPendingReviews).toHaveBeenCalledWith({ page: 1, limit: 10 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 2. CONSULTER UN KYC
  // ──────────────────────────────────────────────────────────────────────────
  describe('getAdminDetailsById', () => {
    it('rejects unauthenticated request', async () => {
      await expect(
        service.getAdminDetailsById('kyc-1', { id: '', role: 'ADMIN' })
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('rejects non-admin actor', async () => {
      await expect(
        service.getAdminDetailsById('kyc-1', buyerActor)
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('rejects when KYC does not exist', async () => {
      repository.findAdminDetailsById.mockResolvedValue(null);

      await expect(
        service.getAdminDetailsById('kyc-nonexistent', adminActor)
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('returns complete admin details with temporary signed document URLs', async () => {
      const mockKyc = {
        id: 'kyc-1',
        userId: 'user-1',
        status: 'SOUMIS',
        user: { id: 'user-1', telephone: '+22890123456', email: 'test@example.com', role: 'ARTISAN' },
        documents: [
          {
            id: 'doc-1',
            kycId: 'kyc-1',
            documentType: 'CNI_RECTO',
            publicId: 'gamalone/kyc/cni-1',
            resourceType: 'image',
            format: 'jpg',
            bytes: 5000,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
        reviewHistory: [],
      };
      repository.findAdminDetailsById.mockResolvedValue(mockKyc);

      const result = await service.getAdminDetailsById('kyc-1', adminActor);
      expect(result.id).toBe('kyc-1');
      expect(result.documents[0].downloadUrl).toBe('https://signed.cloudinary.com/gamalone/kyc/cni-1');
      expect(cloudinaryService.generateSignedUrl).toHaveBeenCalledWith('gamalone/kyc/cni-1', 'image');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 3. APPROUVER
  // ──────────────────────────────────────────────────────────────────────────
  describe('approveKyc', () => {
    it('rejects unauthenticated user', async () => {
      await expect(
        service.approveKyc('kyc-1', { id: '', role: 'ADMIN' })
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('rejects non-admin user', async () => {
      await expect(
        service.approveKyc('kyc-1', buyerActor)
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('rejects when admin profile does not exist', async () => {
      repository.findAdminProfileByUserId.mockResolvedValue(null);

      await expect(
        service.approveKyc('kyc-1', adminActor)
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('rejects when KYC record does not exist', async () => {
      repository.findAdminProfileByUserId.mockResolvedValue({ id: 'admin-profile-1' });
      repository.findById.mockResolvedValue(null);

      await expect(
        service.approveKyc('kyc-nonexistent', adminActor)
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('rejects invalid status transition (e.g. BROUILLON -> VALIDE)', async () => {
      repository.findAdminProfileByUserId.mockResolvedValue({ id: 'admin-profile-1' });
      repository.findById.mockResolvedValue({ id: 'kyc-1', status: 'BROUILLON' });

      await expect(
        service.approveKyc('kyc-1', adminActor)
      ).rejects.toBeInstanceOf(ValidationError);
      expect(repository.approveSubmission).not.toHaveBeenCalled();
    });

    it('rejects invalid status transition from already VALIDE (terminal)', async () => {
      repository.findAdminProfileByUserId.mockResolvedValue({ id: 'admin-profile-1' });
      repository.findById.mockResolvedValue({ id: 'kyc-1', status: 'VALIDE' });

      await expect(
        service.approveKyc('kyc-1', adminActor)
      ).rejects.toBeInstanceOf(ValidationError);
      expect(repository.approveSubmission).not.toHaveBeenCalled();
    });

    it('successfully approves a SOUMIS KYC and returns updated record', async () => {
      repository.findAdminProfileByUserId.mockResolvedValue({ id: 'admin-profile-1' });
      repository.findById.mockResolvedValue({ id: 'kyc-1', status: 'SOUMIS' });
      const approvedKyc = {
        id: 'kyc-1',
        status: 'VALIDE',
        reviewedAt: new Date(),
        reviewedByAdminId: 'admin-profile-1',
      };
      repository.approveSubmission.mockResolvedValue(approvedKyc);

      const result = await service.approveKyc('kyc-1', adminActor);
      expect(result).toEqual(approvedKyc);
      expect(repository.approveSubmission).toHaveBeenCalledWith('kyc-1', 'admin-profile-1');
    });

    it('successfully approves an EN_ATTENTE KYC', async () => {
      repository.findAdminProfileByUserId.mockResolvedValue({ id: 'admin-profile-1' });
      repository.findById.mockResolvedValue({ id: 'kyc-1', status: 'EN_ATTENTE' });
      const approvedKyc = {
        id: 'kyc-1',
        status: 'VALIDE',
        reviewedAt: new Date(),
        reviewedByAdminId: 'admin-profile-1',
      };
      repository.approveSubmission.mockResolvedValue(approvedKyc);

      const result = await service.approveKyc('kyc-1', adminActor);
      expect(result).toEqual(approvedKyc);
      expect(repository.approveSubmission).toHaveBeenCalledWith('kyc-1', 'admin-profile-1');
    });

    it('handles race condition / concurrent conflict during approval', async () => {
      repository.findAdminProfileByUserId.mockResolvedValue({ id: 'admin-profile-1' });
      repository.findById.mockResolvedValue({ id: 'kyc-1', status: 'SOUMIS' });
      repository.approveSubmission.mockResolvedValue({ conflict: true, currentStatus: 'VALIDE' });

      await expect(
        service.approveKyc('kyc-1', adminActor)
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 4. REJETER
  // ──────────────────────────────────────────────────────────────────────────
  describe('rejectKyc', () => {
    it('rejects unauthenticated request', async () => {
      await expect(
        service.rejectKyc('kyc-1', { id: '', role: 'ADMIN' }, 'Fraudulent ID')
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('rejects non-admin actor', async () => {
      await expect(
        service.rejectKyc('kyc-1', buyerActor, 'Fraudulent ID')
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('rejects empty or whitespace reason', async () => {
      await expect(
        service.rejectKyc('kyc-1', adminActor, '   ')
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('rejects when KYC record does not exist', async () => {
      repository.findAdminProfileByUserId.mockResolvedValue({ id: 'admin-profile-1' });
      repository.findById.mockResolvedValue(null);

      await expect(
        service.rejectKyc('kyc-nonexistent', adminActor, 'Reason')
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('rejects invalid status transition (e.g. VALIDE -> REJETE)', async () => {
      repository.findAdminProfileByUserId.mockResolvedValue({ id: 'admin-profile-1' });
      repository.findById.mockResolvedValue({ id: 'kyc-1', status: 'VALIDE' });

      await expect(
        service.rejectKyc('kyc-1', adminActor, 'Expired ID')
      ).rejects.toBeInstanceOf(ValidationError);
      expect(repository.rejectSubmission).not.toHaveBeenCalled();
    });

    it('successfully rejects a SOUMIS KYC with reason', async () => {
      repository.findAdminProfileByUserId.mockResolvedValue({ id: 'admin-profile-1' });
      repository.findById.mockResolvedValue({ id: 'kyc-1', status: 'SOUMIS' });
      const rejectedKyc = {
        id: 'kyc-1',
        status: 'REJETE',
        rejectionReason: 'Identity mismatch',
        reviewedAt: new Date(),
        reviewedByAdminId: 'admin-profile-1',
      };
      repository.rejectSubmission.mockResolvedValue(rejectedKyc);

      const result = await service.rejectKyc('kyc-1', adminActor, 'Identity mismatch');
      expect(result).toEqual(rejectedKyc);
      expect(repository.rejectSubmission).toHaveBeenCalledWith('kyc-1', 'admin-profile-1', 'Identity mismatch');
    });

    it('handles concurrent conflict during rejection', async () => {
      repository.findAdminProfileByUserId.mockResolvedValue({ id: 'admin-profile-1' });
      repository.findById.mockResolvedValue({ id: 'kyc-1', status: 'SOUMIS' });
      repository.rejectSubmission.mockResolvedValue({ conflict: true, currentStatus: 'REJETE' });

      await expect(
        service.rejectKyc('kyc-1', adminActor, 'Reason')
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // 5. DEMANDER UNE CORRECTION
  // ──────────────────────────────────────────────────────────────────────────
  describe('requestKycCorrection', () => {
    it('rejects unauthenticated request', async () => {
      await expect(
        service.requestKycCorrection('kyc-1', { id: '', role: 'ADMIN' }, 'Please upload clear copy')
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('rejects non-admin actor', async () => {
      await expect(
        service.requestKycCorrection('kyc-1', buyerActor, 'Please upload clear copy')
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('rejects empty or whitespace reason', async () => {
      await expect(
        service.requestKycCorrection('kyc-1', adminActor, '   ')
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('rejects invalid status transition (e.g. REJETE -> CORRECTION_REQUISE)', async () => {
      repository.findAdminProfileByUserId.mockResolvedValue({ id: 'admin-profile-1' });
      repository.findById.mockResolvedValue({ id: 'kyc-1', status: 'REJETE' });

      await expect(
        service.requestKycCorrection('kyc-1', adminActor, 'Fix address')
      ).rejects.toBeInstanceOf(ValidationError);
      expect(repository.requestCorrection).not.toHaveBeenCalled();
    });

    it('successfully requests correction on a SOUMIS KYC', async () => {
      repository.findAdminProfileByUserId.mockResolvedValue({ id: 'admin-profile-1' });
      repository.findById.mockResolvedValue({ id: 'kyc-1', status: 'SOUMIS' });
      const correctionKyc = {
        id: 'kyc-1',
        status: 'CORRECTION_REQUISE',
        rejectionReason: 'ID card is blurry, please provide a clear color scan',
        reviewedAt: new Date(),
        reviewedByAdminId: 'admin-profile-1',
      };
      repository.requestCorrection.mockResolvedValue(correctionKyc);

      const result = await service.requestKycCorrection(
        'kyc-1',
        adminActor,
        'ID card is blurry, please provide a clear color scan'
      );
      expect(result).toEqual(correctionKyc);
      expect(repository.requestCorrection).toHaveBeenCalledWith(
        'kyc-1',
        'admin-profile-1',
        'ID card is blurry, please provide a clear color scan'
      );
    });

    it('handles concurrent conflict during correction request', async () => {
      repository.findAdminProfileByUserId.mockResolvedValue({ id: 'admin-profile-1' });
      repository.findById.mockResolvedValue({ id: 'kyc-1', status: 'SOUMIS' });
      repository.requestCorrection.mockResolvedValue({ conflict: true, currentStatus: 'VALIDE' });

      await expect(
        service.requestKycCorrection('kyc-1', adminActor, 'Fix address')
      ).rejects.toBeInstanceOf(ConflictError);
    });
  });

  describe('KycService.getReviewHistory()', () => {
    const kycRecord = { id: 'kyc-1', userId: 'user-1', status: 'VALIDE' };

    const historyEntry = (n: number) => ({
      id: `history-${n}`,
      kycId: 'kyc-1',
      adminId: 'admin-profile-1',
      action: 'APPROUVER',
      reason: null,
      createdAt: new Date(`2026-08-${String(n).padStart(2, '0')}T10:00:00Z`),
      admin: {
        id: 'admin-profile-1',
        departement: 'Compliance',
        niveauAcces: 'STANDARD',
        user: { email: 'admin@gamalone.com', telephone: '+22891000000' },
      },
    });

    it('returns history for a valid admin with existing KYC', async () => {
      repository.findAdminProfileByUserId.mockResolvedValue({ id: 'admin-profile-1' });
      repository.findById.mockResolvedValue(kycRecord);
      repository.findReviewHistoryByKycId.mockResolvedValue([historyEntry(5), historyEntry(3)]);

      const result = await service.getReviewHistory('kyc-1', adminActor);

      expect(result).toHaveLength(2);
      expect(repository.findReviewHistoryByKycId).toHaveBeenCalledWith('kyc-1');
    });

    it('returns empty array when history is empty', async () => {
      repository.findAdminProfileByUserId.mockResolvedValue({ id: 'admin-profile-1' });
      repository.findById.mockResolvedValue(kycRecord);
      repository.findReviewHistoryByKycId.mockResolvedValue([]);

      const result = await service.getReviewHistory('kyc-1', adminActor);

      expect(result).toEqual([]);
      expect(result).toHaveLength(0);
    });

    it('returns multiple decisions ordered createdAt DESC', async () => {
      repository.findAdminProfileByUserId.mockResolvedValue({ id: 'admin-profile-1' });
      repository.findById.mockResolvedValue(kycRecord);
      const h1 = historyEntry(10);
      const h2 = historyEntry(5);
      const h3 = historyEntry(1);
      repository.findReviewHistoryByKycId.mockResolvedValue([h1, h2, h3]);

      const result = await service.getReviewHistory('kyc-1', adminActor);

      expect(result[0].createdAt.getTime()).toBeGreaterThan(result[1].createdAt.getTime());
      expect(result[1].createdAt.getTime()).toBeGreaterThan(result[2].createdAt.getTime());
    });

    it('returns admin info (id, departement, niveauAcces, email, telephone) per entry', async () => {
      repository.findAdminProfileByUserId.mockResolvedValue({ id: 'admin-profile-1' });
      repository.findById.mockResolvedValue(kycRecord);
      repository.findReviewHistoryByKycId.mockResolvedValue([historyEntry(1)]);

      const result = await service.getReviewHistory('kyc-1', adminActor);

      expect(result[0].admin.id).toBe('admin-profile-1');
      expect(result[0].admin.departement).toBe('Compliance');
      expect(result[0].admin.niveauAcces).toBe('STANDARD');
      expect(result[0].admin.user.email).toBe('admin@gamalone.com');
      expect(result[0].admin.user.telephone).toBe('+22891000000');
    });

    it('does not expose password or secret fields', async () => {
      repository.findAdminProfileByUserId.mockResolvedValue({ id: 'admin-profile-1' });
      repository.findById.mockResolvedValue(kycRecord);
      repository.findReviewHistoryByKycId.mockResolvedValue([historyEntry(1)]);

      const result = await service.getReviewHistory('kyc-1', adminActor);

      expect(result[0]).not.toHaveProperty('password');
      expect(result[0].admin.user).not.toHaveProperty('motDePasse');
      expect(result[0].admin.user).not.toHaveProperty('password');
    });

    it('throws UnauthorizedError when actor.id is empty', async () => {
      await expect(
        service.getReviewHistory('kyc-1', { id: '', role: 'ADMIN' })
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('throws ForbiddenError when actor role is not ADMIN', async () => {
      await expect(
        service.getReviewHistory('kyc-1', { id: 'user-1', role: 'USER' })
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('throws ForbiddenError when AdminProfile is not found', async () => {
      repository.findAdminProfileByUserId.mockResolvedValue(null);

      await expect(
        service.getReviewHistory('kyc-1', adminActor)
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('throws NotFoundError when KYC does not exist', async () => {
      repository.findAdminProfileByUserId.mockResolvedValue({ id: 'admin-profile-1' });
      repository.findById.mockResolvedValue(null);

      await expect(
        service.getReviewHistory('kyc-1', adminActor)
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('does not call any mutation method', async () => {
      repository.findAdminProfileByUserId.mockResolvedValue({ id: 'admin-profile-1' });
      repository.findById.mockResolvedValue(kycRecord);
      repository.findReviewHistoryByKycId.mockResolvedValue([]);

      await service.getReviewHistory('kyc-1', adminActor);

      expect(repository.approveSubmission).not.toHaveBeenCalled();
      expect(repository.rejectSubmission).not.toHaveBeenCalled();
      expect(repository.requestCorrection).not.toHaveBeenCalled();
      expect(repository.createSubmission).not.toHaveBeenCalled();
      expect(repository.createResubmission).not.toHaveBeenCalled();
    });
  });
});
