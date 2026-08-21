import type { UploadApiErrorResponse, UploadApiOptions, UploadApiResponse } from 'cloudinary';
import { createCloudinaryClient } from './cloudinary.client.js';
import {
  CloudinaryDeleteError,
  CloudinaryMetadataError,
  CloudinaryNetworkError,
  CloudinaryTimeoutError,
  CloudinaryUploadError,
  CloudinaryValidationError,
} from './cloudinary.errors.js';
import type {
  CloudinaryAssetMetadata,
  CloudinaryDomain,
  CloudinaryResourceType,
  CloudinarySdk,
  CloudinaryUploadInput,
  CloudinaryUploadOptions,
  CloudinaryUploadResult,
} from './cloudinary.types.js';

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const DOCUMENT_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

export class CloudinaryService {
  constructor(
    private readonly client: CloudinarySdk = createCloudinaryClient(),
    private readonly maxFileSizeBytes: number = MAX_FILE_SIZE_BYTES,
    private readonly requestTimeoutMs: number = DEFAULT_TIMEOUT_MS
  ) {}

  uploadImage(file: CloudinaryUploadInput, options: CloudinaryUploadOptions) {
    this.validateUpload(file, options, IMAGE_MIME_TYPES);
    return this.upload(file, options, 'image');
  }

  uploadDocument(file: CloudinaryUploadInput, options: CloudinaryUploadOptions) {
    this.validateUpload(file, options, DOCUMENT_MIME_TYPES);
    return this.upload(file, options, 'raw', 'authenticated');
  }

  uploadFile(file: CloudinaryUploadInput, options: CloudinaryUploadOptions) {
    this.validateUpload(file, options, new Set([options.mimeType]));
    return this.upload(file, options, 'raw');
  }

  async deleteAsset(publicId: string, resourceType: CloudinaryResourceType = 'image'): Promise<void> {
    if (!publicId || publicId.includes('..') || publicId.startsWith('/')) {
      throw new CloudinaryValidationError('Invalid Cloudinary public ID');
    }

    try {
      await this.withTimeout(
        this.client.uploader.destroy(publicId, { resource_type: resourceType, invalidate: true }),
        this.requestTimeoutMs
      );
    } catch (error) {
      throw this.mapError(error, new CloudinaryDeleteError());
    }
  }

  async getAssetMetadata(
    publicId: string,
    resourceType: CloudinaryResourceType = 'image'
  ): Promise<CloudinaryAssetMetadata> {
    if (!publicId || publicId.includes('..') || publicId.startsWith('/')) {
      throw new CloudinaryValidationError('Invalid Cloudinary public ID');
    }

    try {
      const response = await this.withTimeout(
        this.client.api.resource(publicId, { resource_type: resourceType, type: 'upload' }),
        this.requestTimeoutMs
      );
      return this.normalizeResponse(response);
    } catch (error) {
      throw this.mapError(error, new CloudinaryMetadataError());
    }
  }

  generateSignedUrl(
    publicId: string,
    resourceType: CloudinaryResourceType = 'raw',
    expiresInSeconds: number = 3600
  ): string {
    if (!publicId || publicId.includes('..') || publicId.startsWith('/')) {
      throw new CloudinaryValidationError('Invalid Cloudinary public ID');
    }

    const expiresAt = Math.floor(Date.now() / 1000) + expiresInSeconds;
    return this.client.url(publicId, {
      resource_type: resourceType,
      type: 'authenticated',
      sign_url: true,
      expires_at: expiresAt,
      secure: true,
    });
  }

  private async upload(
    file: CloudinaryUploadInput,
    options: CloudinaryUploadOptions,
    resourceType: CloudinaryResourceType,
    type: 'upload' | 'authenticated' = 'upload'
  ): Promise<CloudinaryUploadResult> {
    const uploadOptions: UploadApiOptions = {
      resource_type: resourceType,
      type,
      folder: this.folderFor(options.domain),
    };

    const payload = Buffer.isBuffer(file)
      ? `data:${options.mimeType};base64,${file.toString('base64')}`
      : file;

    try {
      const response = await this.withTimeout(
        this.client.uploader.upload(payload, uploadOptions),
        options.timeoutMs ?? this.requestTimeoutMs
      );
      return this.normalizeResponse(response);
    } catch (error) {
      throw this.mapError(error, new CloudinaryUploadError());
    }
  }

  private validateUpload(
    file: CloudinaryUploadInput,
    options: CloudinaryUploadOptions,
    allowedMimeTypes: Set<string>
  ): void {
    if (!file || !options.domain || !options.mimeType || !Number.isInteger(options.bytes) || options.bytes <= 0) {
      throw new CloudinaryValidationError('Invalid upload parameters');
    }

    if (!allowedMimeTypes.has(options.mimeType)) {
      throw new CloudinaryValidationError('File MIME type is not allowed');
    }

    if (options.bytes > this.maxFileSizeBytes) {
      throw new CloudinaryValidationError('File exceeds the maximum allowed size');
    }
  }

  private folderFor(domain: CloudinaryDomain): string {
    return `gamalone/${domain}`;
  }

  private normalizeResponse(response: UploadApiResponse): CloudinaryUploadResult {
    if (!response.secure_url || !response.public_id || !response.resource_type || !Number.isFinite(response.bytes)) {
      throw new CloudinaryUploadError();
    }

    return {
      secureUrl: response.secure_url,
      publicId: response.public_id,
      resourceType: response.resource_type,
      format: response.format ?? null,
      bytes: response.bytes,
      ...(response.asset_id ? { assetId: response.asset_id } : {}),
    };
  }

  private mapError(error: unknown, fallback: Error): Error {
    if (error instanceof CloudinaryTimeoutError || error instanceof CloudinaryValidationError) {
      return error;
    }

    if (error instanceof Error && error.message === 'CLOUDINARY_TIMEOUT') {
      return new CloudinaryTimeoutError();
    }

    if (error instanceof TypeError || this.isNetworkError(error)) {
      return new CloudinaryNetworkError();
    }

    return fallback;
  }

  private isNetworkError(error: unknown): boolean {
    const code = (error as UploadApiErrorResponse | undefined)?.http_code;
    return code === 408 || code === 429 || (typeof code === 'number' && code >= 500);
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(() => reject(new Error('CLOUDINARY_TIMEOUT')), timeoutMs);
    });

    try {
      return await Promise.race([promise, timeout]);
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }
}
