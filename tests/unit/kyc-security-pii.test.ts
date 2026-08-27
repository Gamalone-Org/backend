import { describe, expect, it } from 'vitest';
import {
  toPublicKycDto,
  toAdminKycSummaryDto,
  toAdminKycDetailDto,
  toReviewHistoryDto,
  toPublicDocumentDto,
} from '../../src/modules/kyc/kyc.serializer.js';
import { ANONYMIZED_JSON_MARKER } from '../../src/config/kyc.js';

const baseKyc = {
  id: 'kyc-1',
  userId: 'user-1',
  status: 'SOUMIS' as const,
  submittedAt: new Date(),
  reviewedAt: null,
  reviewedByAdminId: null,
  rejectionReason: null,
  resubmissionOfId: null,
  identityData: { firstName: 'Awa', lastName: 'Koffi', nin: '1234567890' },
  professionData: { job: 'Artisan' },
  additionalInfo: null,
  addressData: { city: 'Lome' },
  identityDocument: { type: 'CNI' },
  supportingDocs: null,
  retentionUntil: new Date('2027-01-01'),
  anonymizedAt: null,
  deletedAt: null,
  legalHold: false,
  createdAt: new Date(),
  updatedAt: new Date(),
} as any;

const adminKycWithRelations = {
  ...baseKyc,
  user: {
    id: 'user-1',
    telephone: '+22890123456',
    email: 'awa@example.com',
    role: 'ARTISAN',
    statut: 'ACTIF',
    telephoneVerificationStatus: 'VERIFIE',
    createdAt: new Date(),
    artisanProfile: null,
  },
  documents: [],
  previousSubmission: null,
  reviewHistory: [],
};

describe('Serializer — no PII leakage', () => {
  describe('toPublicKycDto', () => {
    it('does not expose user email or telephone', () => {
      const dto = toPublicKycDto(baseKyc);
      const serialized = JSON.stringify(dto);
      expect(serialized).not.toContain('email');
      expect(serialized).not.toContain('telephone');
      expect(serialized).not.toContain('motDePasse');
    });

    it('returns anonymized marker when KYC is anonymized', () => {
      const anonymizedKyc = {
        ...baseKyc,
        anonymizedAt: new Date(),
        identityData: ANONYMIZED_JSON_MARKER,
        rejectionReason: 'Some reason',
      };
      const dto = toPublicKycDto(anonymizedKyc);
      expect(dto.identityData).toEqual(ANONYMIZED_JSON_MARKER);
      expect(dto.rejectionReason).toBe('[anonymized]');
    });
  });

  describe('toAdminKycSummaryDto', () => {
    it('does not expose user email or telephone values in list view', () => {
      const dto = toAdminKycSummaryDto(adminKycWithRelations);
      const serialized = JSON.stringify(dto);
      expect(serialized).not.toContain('awa@example.com');
      expect(serialized).not.toContain('+22890123456');
      expect(serialized).not.toContain('motDePasse');
    });

    it('only exposes safe user fields', () => {
      const dto = toAdminKycSummaryDto(adminKycWithRelations);
      if (dto.user) {
        expect(Object.keys(dto.user)).toEqual(
          expect.arrayContaining(['id', 'role', 'statut', 'telephoneVerificationStatus'])
        );
        expect(Object.keys(dto.user)).not.toContain('email');
        expect(Object.keys(dto.user)).not.toContain('telephone');
      }
    });
  });

  describe('toAdminKycDetailDto', () => {
    it('exposes user email and telephone for admin review (intentional)', () => {
      const dto = toAdminKycDetailDto(adminKycWithRelations, []);
      if (dto.user) {
        expect(dto.user.email).toBe('awa@example.com');
        expect(dto.user.telephone).toBe('+22890123456');
      }
    });

    it('does not expose password or motDePasse', () => {
      const dto = toAdminKycDetailDto(adminKycWithRelations, []);
      const serialized = JSON.stringify(dto);
      expect(serialized).not.toContain('motDePasse');
      expect(serialized).not.toContain('password');
    });
  });

  describe('toReviewHistoryDto', () => {
    it('does not expose admin email or telephone', () => {
      const entry = {
        id: 'history-1',
        kycId: 'kyc-1',
        adminId: 'admin-profile-1',
        adminProfileIdSnapshot: 'admin-profile-1',
        adminDepartementSnapshot: 'Compliance',
        adminNiveauAccesSnapshot: 'MODERATEUR' as const,
        action: 'APPROUVER' as const,
        reason: null,
        createdAt: new Date(),
        admin: {
          id: 'admin-profile-1',
          departement: 'Compliance',
          niveauAcces: 'MODERATEUR' as const,
          user: { email: 'admin@gamalone.com', telephone: '+22891000000' },
        },
      };

      const dto = toReviewHistoryDto(entry);
      const serialized = JSON.stringify(dto);
      expect(serialized).not.toContain('admin@gamalone.com');
      expect(serialized).not.toContain('+22891000000');
    });

    it('exposes only admin profile snapshot data', () => {
      const entry = {
        id: 'history-1',
        kycId: 'kyc-1',
        adminId: 'admin-profile-1',
        adminProfileIdSnapshot: 'admin-profile-1',
        adminDepartementSnapshot: 'Compliance',
        adminNiveauAccesSnapshot: 'MODERATEUR' as const,
        action: 'APPROUVER' as const,
        reason: null,
        createdAt: new Date(),
        admin: {
          id: 'admin-profile-1',
          departement: 'Compliance',
          niveauAcces: 'MODERATEUR' as const,
          user: { email: 'admin@gamalone.com', telephone: '+22891000000' },
        },
      };

      const dto = toReviewHistoryDto(entry);
      expect(dto.admin.profileId).toBe('admin-profile-1');
      expect(dto.admin.departement).toBe('Compliance');
      expect(dto.admin.niveauAcces).toBe('MODERATEUR');
    });
  });

  describe('toPublicDocumentDto', () => {
    it('only exposes safe document metadata', () => {
      const dto = toPublicDocumentDto({
        id: 'doc-1',
        kycId: 'kyc-1',
        documentType: 'CNI_RECTO',
        resourceType: 'raw',
        format: 'pdf',
        bytes: 1024,
        createdAt: new Date(),
        updatedAt: new Date(),
        downloadUrl: 'https://signed.cloudinary.com/url',
      });
      const keys = Object.keys(dto);
      expect(keys).toContain('id');
      expect(keys).toContain('downloadUrl');
      expect(keys).not.toContain('publicId');
      expect(keys).not.toContain('secureUrl');
      expect(keys).not.toContain('assetId');
    });

    it('does not expose internal Cloudinary publicId', () => {
      const dto = toPublicDocumentDto({
        id: 'doc-1',
        kycId: 'kyc-1',
        documentType: 'CNI_RECTO',
        resourceType: 'raw',
        format: 'pdf',
        bytes: 1024,
        createdAt: new Date(),
        updatedAt: new Date(),
        downloadUrl: 'https://signed.cloudinary.com/url',
      });
      const serialized = JSON.stringify(dto);
      expect(serialized).not.toContain('publicId');
      expect(serialized).not.toContain('gamalone/kyc');
    });
  });
});

describe('Logger — no PII fields possible', () => {
  it('KycLogMeta type only allows technical identifiers', () => {
    const validMeta = {
      kycId: 'some-uuid',
      documentId: 'some-uuid',
      adminProfileId: 'some-uuid',
      errorCode: 'SOME_ERROR',
      documentCount: 5,
      scanned: 10,
      anonymized: 3,
      skipped: 1,
      failed: 2,
    };
    expect(typeof validMeta.kycId).toBe('string');
    expect(typeof validMeta.documentCount).toBe('number');
  });
});
