import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError, NotFoundError, ValidationError } from '../../src/common/errors/AppError.js';
import { KycPrivacyService } from '../../src/modules/kyc/kyc-privacy.service.js';
import { KycPurgeService, createPurgeScheduler } from '../../src/modules/kyc/kyc-purge.service.js';

function createMockPrivacyRepository() {
  return {
    findKycById: vi.fn(),
    findEligibleForPurge: vi.fn(),
    setLegalHold: vi.fn(),
    anonymizeKycRecord: vi.fn(),
    markDocumentAnonymized: vi.fn(),
  };
}

function createMockCloudinaryService() {
  return {
    deleteAsset: vi.fn(),
    generateSignedUrl: vi.fn(),
    uploadDocument: vi.fn(),
  };
}

function createMockPrivacyService() {
  return {
    anonymizeKyc: vi.fn(),
    setLegalHold: vi.fn(),
  };
}

describe('KycPrivacyService', () => {
  let repository: ReturnType<typeof createMockPrivacyRepository>;
  let cloudinary: ReturnType<typeof createMockCloudinaryService>;
  let service: KycPrivacyService;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = createMockPrivacyRepository();
    cloudinary = createMockCloudinaryService();
    service = new KycPrivacyService(repository as any, cloudinary as any);
  });

  describe('anonymizeKyc', () => {
    it('throws NotFoundError when KYC does not exist', async () => {
      repository.findKycById.mockResolvedValue(null);

      await expect(service.anonymizeKyc('kyc-unknown')).rejects.toBeInstanceOf(NotFoundError);
    });

    it('returns alreadyAnonymized when KYC is already anonymized', async () => {
      repository.findKycById.mockResolvedValue({
        id: 'kyc-1',
        anonymizedAt: new Date('2026-01-01'),
        legalHold: false,
        retentionUntil: new Date('2025-12-01'),
        documents: [],
      });

      const result = await service.anonymizeKyc('kyc-1');
      expect(result.alreadyAnonymized).toBe(true);
      expect(result.kycId).toBe('kyc-1');
    });

    it('throws ForbiddenError when KYC is under legal hold', async () => {
      repository.findKycById.mockResolvedValue({
        id: 'kyc-1',
        anonymizedAt: null,
        legalHold: true,
        retentionUntil: new Date('2025-12-01'),
        documents: [],
      });

      await expect(service.anonymizeKyc('kyc-1')).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('throws ValidationError when retention has not expired (without force)', async () => {
      repository.findKycById.mockResolvedValue({
        id: 'kyc-1',
        anonymizedAt: null,
        legalHold: false,
        retentionUntil: new Date('2099-12-31'),
        documents: [],
      });

      await expect(service.anonymizeKyc('kyc-1')).rejects.toBeInstanceOf(ValidationError);
    });

    it('allows force anonymization before retention expires', async () => {
      repository.findKycById.mockResolvedValue({
        id: 'kyc-1',
        anonymizedAt: null,
        legalHold: false,
        retentionUntil: new Date('2099-12-31'),
        documents: [],
      });
      repository.anonymizeKycRecord.mockResolvedValue({
        id: 'kyc-1',
        anonymizedAt: new Date(),
        documents: [],
        alreadyAnonymized: false,
      });

      const result = await service.anonymizeKyc('kyc-1', { force: true });
      expect(result.alreadyAnonymized).toBe(false);
      expect(repository.anonymizeKycRecord).toHaveBeenCalledWith('kyc-1', { force: true });
    });

    it('deletes Cloudinary assets and marks documents as anonymized', async () => {
      repository.findKycById.mockResolvedValue({
        id: 'kyc-1',
        anonymizedAt: null,
        legalHold: false,
        retentionUntil: new Date('2025-01-01'),
        documents: [
          { id: 'doc-1', publicId: 'gamalone/kyc/doc1', resourceType: 'raw', anonymizedAt: null, deletedAt: null },
          { id: 'doc-2', publicId: 'gamalone/kyc/doc2', resourceType: 'raw', anonymizedAt: null, deletedAt: null },
        ],
      });
      repository.anonymizeKycRecord.mockResolvedValue({
        id: 'kyc-1',
        anonymizedAt: new Date(),
        documents: [
          { id: 'doc-1', publicId: 'gamalone/kyc/doc1', resourceType: 'raw' },
          { id: 'doc-2', publicId: 'gamalone/kyc/doc2', resourceType: 'raw' },
        ],
        alreadyAnonymized: false,
      });
      cloudinary.deleteAsset.mockResolvedValue(undefined);
      repository.markDocumentAnonymized.mockResolvedValue({});

      const result = await service.anonymizeKyc('kyc-1');
      expect(result.documentsProcessed).toBe(2);
      expect(cloudinary.deleteAsset).toHaveBeenCalledTimes(2);
      expect(repository.markDocumentAnonymized).toHaveBeenCalledTimes(2);
    });

    it('aborts if Cloudinary deletion fails for any document', async () => {
      repository.findKycById.mockResolvedValue({
        id: 'kyc-1',
        anonymizedAt: null,
        legalHold: false,
        retentionUntil: new Date('2025-01-01'),
        documents: [
          { id: 'doc-1', publicId: 'gamalone/kyc/doc1', resourceType: 'raw', anonymizedAt: null, deletedAt: null },
        ],
      });
      repository.anonymizeKycRecord.mockResolvedValue({
        id: 'kyc-1',
        anonymizedAt: new Date(),
        documents: [
          { id: 'doc-1', publicId: 'gamalone/kyc/doc1', resourceType: 'raw' },
        ],
        alreadyAnonymized: false,
      });
      cloudinary.deleteAsset.mockRejectedValue(new Error('Cloudinary error'));

      await expect(service.anonymizeKyc('kyc-1')).rejects.toThrow();
      expect(repository.markDocumentAnonymized).not.toHaveBeenCalled();
    });

    it('skips already-anonymized or deleted documents', async () => {
      repository.findKycById.mockResolvedValue({
        id: 'kyc-1',
        anonymizedAt: null,
        legalHold: false,
        retentionUntil: new Date('2025-01-01'),
        documents: [],
      });
      repository.anonymizeKycRecord.mockResolvedValue({
        id: 'kyc-1',
        anonymizedAt: new Date(),
        documents: [
          { id: 'doc-1', publicId: 'gamalone/kyc/doc1', resourceType: 'raw', anonymizedAt: new Date(), deletedAt: null },
        ],
        alreadyAnonymized: false,
      });

      const result = await service.anonymizeKyc('kyc-1');
      expect(result.documentsProcessed).toBe(0);
      expect(cloudinary.deleteAsset).not.toHaveBeenCalled();
    });
  });

  describe('setLegalHold', () => {
    it('throws NotFoundError when KYC does not exist', async () => {
      repository.findKycById.mockResolvedValue(null);

      await expect(service.setLegalHold('kyc-unknown', true)).rejects.toBeInstanceOf(NotFoundError);
    });

    it('sets legal hold and returns updated record', async () => {
      repository.findKycById.mockResolvedValue({ id: 'kyc-1' });
      repository.setLegalHold.mockResolvedValue({ id: 'kyc-1', legalHold: true });

      const result = await service.setLegalHold('kyc-1', true);
      expect(result.legalHold).toBe(true);
      expect(repository.setLegalHold).toHaveBeenCalledWith('kyc-1', true);
    });
  });
});

describe('KycPurgeService', () => {
  let privacyRepo: ReturnType<typeof createMockPrivacyRepository>;
  let privacyService: ReturnType<typeof createMockPrivacyService>;
  let purgeService: KycPurgeService;

  beforeEach(() => {
    vi.clearAllMocks();
    privacyRepo = createMockPrivacyRepository();
    privacyService = createMockPrivacyService();
    purgeService = new KycPurgeService(privacyRepo as any, privacyService as any);
  });

  it('returns zero counts when no eligible records exist', async () => {
    privacyRepo.findEligibleForPurge.mockResolvedValue([]);

    const result = await purgeService.runPurge();
    expect(result.scanned).toBe(0);
    expect(result.anonymized).toBe(0);
    expect(result.skipped).toBe(0);
    expect(result.failed).toBe(0);
  });

  it('skips records under legal hold', async () => {
    privacyRepo.findEligibleForPurge.mockResolvedValue([
      { id: 'kyc-1', legalHold: true },
    ]);

    const result = await purgeService.runPurge();
    expect(result.skipped).toBe(1);
    expect(result.anonymized).toBe(0);
    expect(privacyService.anonymizeKyc).not.toHaveBeenCalled();
  });

  it('anonymizes eligible records', async () => {
    privacyRepo.findEligibleForPurge.mockResolvedValue([
      { id: 'kyc-1', legalHold: false },
      { id: 'kyc-2', legalHold: false },
    ]);
    privacyService.anonymizeKyc.mockResolvedValue({ alreadyAnonymized: false });

    const result = await purgeService.runPurge();
    expect(result.anonymized).toBe(2);
    expect(privacyService.anonymizeKyc).toHaveBeenCalledTimes(2);
  });

  it('handles already-anonymized records as skipped', async () => {
    privacyRepo.findEligibleForPurge.mockResolvedValue([
      { id: 'kyc-1', legalHold: false },
    ]);
    privacyService.anonymizeKyc.mockResolvedValue({ alreadyAnonymized: true });

    const result = await purgeService.runPurge();
    expect(result.skipped).toBe(1);
    expect(result.anonymized).toBe(0);
  });

  it('counts failures without aborting remaining items', async () => {
    privacyRepo.findEligibleForPurge.mockResolvedValue([
      { id: 'kyc-1', legalHold: false },
      { id: 'kyc-2', legalHold: false },
    ]);
    privacyService.anonymizeKyc
      .mockRejectedValueOnce(new Error('Cloudinary failure'))
      .mockResolvedValueOnce({ alreadyAnonymized: false });

    const result = await purgeService.runPurge();
    expect(result.failed).toBe(1);
    expect(result.anonymized).toBe(1);
  });

  it('is idempotent — running twice does not duplicate work', async () => {
    privacyRepo.findEligibleForPurge
      .mockResolvedValueOnce([{ id: 'kyc-1', legalHold: false }])
      .mockResolvedValueOnce([]);
    privacyService.anonymizeKyc.mockResolvedValue({ alreadyAnonymized: false });

    const r1 = await purgeService.runPurge();
    const r2 = await purgeService.runPurge();

    expect(r1.anonymized).toBe(1);
    expect(r2.anonymized).toBe(0);
    expect(r2.scanned).toBe(0);
  });
});

describe('createPurgeScheduler', () => {
  let privacyRepo: ReturnType<typeof createMockPrivacyRepository>;
  let privacyService: ReturnType<typeof createMockPrivacyService>;

  beforeEach(() => {
    vi.clearAllMocks();
    privacyRepo = createMockPrivacyRepository();
    privacyService = createMockPrivacyService();
  });

  it('runOnce delegates to purgeService.runPurge', async () => {
    const purgeService = new KycPurgeService(privacyRepo as any, privacyService as any);
    const scheduler = createPurgeScheduler(purgeService);
    privacyRepo.findEligibleForPurge.mockResolvedValue([]);

    const result = await scheduler.runOnce();
    expect(result.scanned).toBe(0);
  });

  it('throws when starting with interval below 60000ms', () => {
    const purgeService = new KycPurgeService(privacyRepo as any, privacyService as any);
    const scheduler = createPurgeScheduler(purgeService);

    expect(() => scheduler.start(30_000)).toThrow('Purge interval must be at least 60000ms');
  });

  it('throws when starting with non-integer interval', () => {
    const purgeService = new KycPurgeService(privacyRepo as any, privacyService as any);
    const scheduler = createPurgeScheduler(purgeService);

    expect(() => scheduler.start(150_000.5)).toThrow('Purge interval must be at least 60000ms');
  });

  it('throws when scheduler is already running', () => {
    const purgeService = new KycPurgeService(privacyRepo as any, privacyService as any);
    const scheduler = createPurgeScheduler(purgeService);

    const stop = scheduler.start(60_000);
    expect(() => scheduler.start(120_000)).toThrow('Purge scheduler is already running');
    stop();
  });

  it('stop function clears the interval', () => {
    const purgeService = new KycPurgeService(privacyRepo as any, privacyService as any);
    const scheduler = createPurgeScheduler(purgeService);

    const stop = scheduler.start(60_000);
    expect(typeof stop).toBe('function');
    stop();
  });
});
