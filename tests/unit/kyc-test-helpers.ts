import { vi } from 'vitest';
import { KycPrivacyService } from '../../src/modules/kyc/kyc-privacy.service.js';
import { KycPurgeService } from '../../src/modules/kyc/kyc-purge.service.js';
import { KycService } from '../../src/modules/kyc/kyc.service.js';

export function createMockPrivacyService() {
  return {
    anonymizeKyc: vi.fn(),
    setLegalHold: vi.fn(),
  } as unknown as KycPrivacyService;
}

export function createMockPurgeService() {
  return {
    runPurge: vi.fn(),
  } as unknown as KycPurgeService;
}

export function createMockCloudinaryService() {
  return {
    uploadDocument: vi.fn(),
    generateSignedUrl: vi.fn((publicId: string) => `https://signed.cloudinary.com/${publicId}`),
    deleteAsset: vi.fn(),
  };
}

export function createKycServiceForTest(
  repository: unknown,
  cloudinaryService = createMockCloudinaryService(),
  privacyService = createMockPrivacyService(),
  purgeService = createMockPurgeService()
) {
  return new KycService(
    repository as any,
    cloudinaryService as any,
    privacyService as any,
    purgeService as any
  );
}

export const moderatorAdminActor = {
  id: 'admin-user-1',
  role: 'ADMIN',
  adminProfileId: 'admin-profile-1',
  adminAccessLevel: 'MODERATEUR' as const,
};

export const supportAdminActor = {
  id: 'admin-user-1',
  role: 'ADMIN',
  adminProfileId: 'admin-profile-1',
  adminAccessLevel: 'SUPPORT' as const,
};

export const superAdminActor = {
  id: 'admin-user-1',
  role: 'ADMIN',
  adminProfileId: 'admin-profile-1',
  adminAccessLevel: 'SUPER_ADMIN' as const,
};
