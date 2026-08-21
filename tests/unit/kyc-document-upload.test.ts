import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../src/common/errors/AppError.js';
import { detectMimeTypeFromMagicBytes } from '../../src/modules/kyc/middleware/kyc-upload.middleware.js';
import { KycService } from '../../src/modules/kyc/kyc.service.js';

const validPdfBuffer = Buffer.from('%PDF-1.5 fake pdf content');
const validJpegBuffer = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const validPngBuffer = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00]);
const fakeMaliciousBuffer = Buffer.from('this is malicious plain text disguised as image');

describe('KYC Document Upload & Magic Bytes Detection', () => {
  describe('detectMimeTypeFromMagicBytes', () => {
    it('detects PDF magic bytes correctly', () => {
      expect(detectMimeTypeFromMagicBytes(validPdfBuffer)).toBe('application/pdf');
    });

    it('detects JPEG magic bytes correctly', () => {
      expect(detectMimeTypeFromMagicBytes(validJpegBuffer)).toBe('image/jpeg');
    });

    it('detects PNG magic bytes correctly', () => {
      expect(detectMimeTypeFromMagicBytes(validPngBuffer)).toBe('image/png');
    });

    it('rejects plain text or mismatched content', () => {
      expect(detectMimeTypeFromMagicBytes(fakeMaliciousBuffer)).toBeNull();
      expect(detectMimeTypeFromMagicBytes(Buffer.from('GIF89a'))).toBeNull();
      expect(detectMimeTypeFromMagicBytes(Buffer.alloc(2))).toBeNull();
    });
  });

  describe('KycService.uploadDocument', () => {
    const mockFindById = vi.fn();
    const mockFindUserPhoneVerification = vi.fn();
    const mockCreateDocument = vi.fn();
    const mockUploadDocument = vi.fn();
    const mockDeleteAsset = vi.fn();

    const mockRepo = {
      findById: mockFindById,
      findUserPhoneVerification: mockFindUserPhoneVerification,
      createDocument: mockCreateDocument,
    } as any;

    const mockCloudinaryService = {
      uploadDocument: mockUploadDocument,
      deleteAsset: mockDeleteAsset,
    } as any;

    let service: KycService;

    beforeEach(() => {
      vi.clearAllMocks();
      service = new KycService(mockRepo, mockCloudinaryService);

      mockFindById.mockResolvedValue({
        id: 'kyc-1',
        userId: 'user-1',
        status: 'SOUMIS',
      });
      mockFindUserPhoneVerification.mockResolvedValue({
        telephoneVerificationStatus: 'VERIFIE',
      });
      mockUploadDocument.mockResolvedValue({
        secureUrl: 'https://res.cloudinary.com/gamalone/raw/authenticated/kyc-file.pdf',
        publicId: 'gamalone/kyc/kyc-file',
        resourceType: 'raw',
        format: 'pdf',
        bytes: 1024,
        assetId: 'asset-123',
      });
      mockCreateDocument.mockResolvedValue({
        id: 'doc-1',
        kycId: 'kyc-1',
        documentType: 'CNI_RECTO',
        secureUrl: 'https://res.cloudinary.com/gamalone/raw/authenticated/kyc-file.pdf',
        publicId: 'gamalone/kyc/kyc-file',
        resourceType: 'raw',
        format: 'pdf',
        bytes: 1024,
        assetId: 'asset-123',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      mockDeleteAsset.mockResolvedValue(undefined);
    });

    it('rejects unauthenticated caller', async () => {
      await expect(
        service.uploadDocument('kyc-1', '', 'CNI_RECTO', { buffer: validPdfBuffer } as any)
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('rejects missing file', async () => {
      await expect(
        service.uploadDocument('kyc-1', 'user-1', 'CNI_RECTO', undefined)
      ).rejects.toBeInstanceOf(ValidationError);
    });

    it('rejects non-existent KYC', async () => {
      mockFindById.mockResolvedValueOnce(null);
      await expect(
        service.uploadDocument('kyc-unknown', 'user-1', 'CNI_RECTO', { buffer: validPdfBuffer } as any)
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('rejects non-owner actor', async () => {
      mockFindById.mockResolvedValueOnce({
        id: 'kyc-1',
        userId: 'other-user',
        status: 'SOUMIS',
      });

      await expect(
        service.uploadDocument('kyc-1', 'user-1', 'CNI_RECTO', { buffer: validPdfBuffer } as any)
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('rejects user with unverified phone', async () => {
      mockFindUserPhoneVerification.mockResolvedValueOnce({
        telephoneVerificationStatus: 'NON_VERIFIE',
      });

      await expect(
        service.uploadDocument('kyc-1', 'user-1', 'CNI_RECTO', { buffer: validPdfBuffer } as any)
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('rejects upload when KYC status is VALIDE or REJETE', async () => {
      mockFindById.mockResolvedValueOnce({
        id: 'kyc-1',
        userId: 'user-1',
        status: 'VALIDE',
      });

      await expect(
        service.uploadDocument('kyc-1', 'user-1', 'CNI_RECTO', { buffer: validPdfBuffer } as any)
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('rejects file with fake or corrupted magic bytes', async () => {
      await expect(
        service.uploadDocument('kyc-1', 'user-1', 'CNI_RECTO', { buffer: fakeMaliciousBuffer } as any)
      ).rejects.toBeInstanceOf(ValidationError);
      expect(mockUploadDocument).not.toHaveBeenCalled();
    });

    it('uploads valid document to Cloudinary and persists in DB', async () => {
      const result = await service.uploadDocument(
        'kyc-1',
        'user-1',
        'CNI_RECTO',
        { buffer: validPdfBuffer, size: validPdfBuffer.length, mimetype: 'application/pdf' } as any
      );

      expect(mockUploadDocument).toHaveBeenCalledWith(validPdfBuffer, {
        domain: 'kyc',
        mimeType: 'application/pdf',
        bytes: validPdfBuffer.length,
      });

      expect(mockCreateDocument).toHaveBeenCalledWith('kyc-1', {
        documentType: 'CNI_RECTO',
        secureUrl: 'https://res.cloudinary.com/gamalone/raw/authenticated/kyc-file.pdf',
        publicId: 'gamalone/kyc/kyc-file',
        resourceType: 'raw',
        format: 'pdf',
        bytes: 1024,
        assetId: 'asset-123',
      });

      expect(result).toHaveProperty('id', 'doc-1');
      expect(result).toHaveProperty('documentType', 'CNI_RECTO');
      expect(mockDeleteAsset).not.toHaveBeenCalled();
    });

    it('compensates and deletes Cloudinary asset if PostgreSQL creation fails', async () => {
      mockCreateDocument.mockRejectedValueOnce(new Error('Database unique constraint or connection failure'));

      await expect(
        service.uploadDocument(
          'kyc-1',
          'user-1',
          'CNI_RECTO',
          { buffer: validJpegBuffer, size: validJpegBuffer.length, mimetype: 'image/jpeg' } as any
        )
      ).rejects.toThrow('Database unique constraint or connection failure');

      expect(mockUploadDocument).toHaveBeenCalled();
      expect(mockDeleteAsset).toHaveBeenCalledWith('gamalone/kyc/kyc-file', 'raw');
    });
  });

  describe('KycService.getDocuments', () => {
    const mockFindById = vi.fn();
    const mockFindDocumentsByKycId = vi.fn();
    const mockGenerateSignedUrl = vi.fn();

    const mockRepo = {
      findById: mockFindById,
      findDocumentsByKycId: mockFindDocumentsByKycId,
    } as any;

    const mockCloudinaryService = {
      generateSignedUrl: mockGenerateSignedUrl,
    } as any;

    let service: KycService;

    beforeEach(() => {
      vi.clearAllMocks();
      service = new KycService(mockRepo, mockCloudinaryService);

      mockFindById.mockResolvedValue({
        id: 'kyc-1',
        userId: 'user-1',
        status: 'SOUMIS',
      });
      mockFindDocumentsByKycId.mockResolvedValue([
        {
          id: 'doc-1',
          kycId: 'kyc-1',
          documentType: 'CNI_RECTO',
          publicId: 'gamalone/kyc/cni-recto',
          resourceType: 'raw',
          format: 'pdf',
          bytes: 1024,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ]);
      mockGenerateSignedUrl.mockReturnValue('https://res.cloudinary.com/signed-url');
    });

    it('rejects unauthenticated caller', async () => {
      await expect(service.getDocuments('kyc-1', { id: '', role: 'ACHETEUR' })).rejects.toBeInstanceOf(
        UnauthorizedError
      );
    });

    it('rejects non-existent KYC', async () => {
      mockFindById.mockResolvedValueOnce(null);
      await expect(service.getDocuments('kyc-unknown', { id: 'user-1', role: 'ACHETEUR' })).rejects.toBeInstanceOf(
        NotFoundError
      );
    });

    it('rejects non-owner non-admin caller', async () => {
      await expect(service.getDocuments('kyc-1', { id: 'other-user', role: 'ACHETEUR' })).rejects.toBeInstanceOf(
        ForbiddenError
      );
    });

    it('returns documents with temporary signed URLs for authorized owner', async () => {
      const docs = await service.getDocuments('kyc-1', { id: 'user-1', role: 'ACHETEUR' });

      expect(mockFindDocumentsByKycId).toHaveBeenCalledWith('kyc-1');
      expect(mockGenerateSignedUrl).toHaveBeenCalledWith('gamalone/kyc/cni-recto', 'raw');
      expect(docs).toHaveLength(1);
      expect(docs[0]).toHaveProperty('downloadUrl', 'https://res.cloudinary.com/signed-url');
    });
  });

  describe('KycService.deleteDocument', () => {
    const mockFindById = vi.fn();
    const mockFindDocumentById = vi.fn();
    const mockDeleteDocument = vi.fn();
    const mockDeleteAsset = vi.fn();

    const mockRepo = {
      findById: mockFindById,
      findDocumentById: mockFindDocumentById,
      deleteDocument: mockDeleteDocument,
    } as any;

    const mockCloudinaryService = {
      deleteAsset: mockDeleteAsset,
    } as any;

    let service: KycService;

    beforeEach(() => {
      vi.clearAllMocks();
      service = new KycService(mockRepo, mockCloudinaryService);

      mockFindById.mockResolvedValue({
        id: 'kyc-1',
        userId: 'user-1',
        status: 'SOUMIS',
      });
      mockFindDocumentById.mockResolvedValue({
        id: 'doc-1',
        kycId: 'kyc-1',
        publicId: 'gamalone/kyc/cni-recto',
        resourceType: 'raw',
      });
      mockDeleteAsset.mockResolvedValue(undefined);
      mockDeleteDocument.mockResolvedValue(undefined);
    });

    it('rejects unauthenticated caller', async () => {
      await expect(
        service.deleteDocument('kyc-1', 'doc-1', { id: '', role: 'ACHETEUR' })
      ).rejects.toBeInstanceOf(UnauthorizedError);
    });

    it('rejects non-existent KYC', async () => {
      mockFindById.mockResolvedValueOnce(null);
      await expect(
        service.deleteDocument('kyc-unknown', 'doc-1', { id: 'user-1', role: 'ACHETEUR' })
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('rejects non-owner non-admin caller', async () => {
      await expect(
        service.deleteDocument('kyc-1', 'doc-1', { id: 'other-user', role: 'ACHETEUR' })
      ).rejects.toBeInstanceOf(ForbiddenError);
    });

    it('rejects non-existent document or document belonging to another KYC', async () => {
      mockFindDocumentById.mockResolvedValueOnce(null);
      await expect(
        service.deleteDocument('kyc-1', 'doc-unknown', { id: 'user-1', role: 'ACHETEUR' })
      ).rejects.toBeInstanceOf(NotFoundError);

      mockFindDocumentById.mockResolvedValueOnce({
        id: 'doc-2',
        kycId: 'other-kyc',
        publicId: 'gamalone/kyc/other',
        resourceType: 'raw',
      });
      await expect(
        service.deleteDocument('kyc-1', 'doc-2', { id: 'user-1', role: 'ACHETEUR' })
      ).rejects.toBeInstanceOf(NotFoundError);
    });

    it('does NOT delete PostgreSQL record if Cloudinary deletion fails', async () => {
      mockDeleteAsset.mockRejectedValueOnce(new Error('Cloudinary deletion failed'));

      await expect(
        service.deleteDocument('kyc-1', 'doc-1', { id: 'user-1', role: 'ACHETEUR' })
      ).rejects.toThrow('Cloudinary deletion failed');

      expect(mockDeleteAsset).toHaveBeenCalledWith('gamalone/kyc/cni-recto', 'raw');
      expect(mockDeleteDocument).not.toHaveBeenCalled();
    });

    it('deletes Cloudinary asset first then deletes PostgreSQL record on success', async () => {
      const result = await service.deleteDocument('kyc-1', 'doc-1', { id: 'user-1', role: 'ACHETEUR' });

      expect(mockDeleteAsset).toHaveBeenCalledWith('gamalone/kyc/cni-recto', 'raw');
      expect(mockDeleteDocument).toHaveBeenCalledWith('doc-1');
      expect(result).toEqual({ success: true, message: 'KYC document deleted successfully' });
    });
  });
});

