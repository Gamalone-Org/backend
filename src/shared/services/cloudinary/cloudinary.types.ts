import type { UploadApiOptions, UploadApiResponse } from 'cloudinary';

export const CLOUDINARY_DOMAINS = ['kyc', 'media', 'users', 'artworks'] as const;
export type CloudinaryDomain = (typeof CLOUDINARY_DOMAINS)[number];
export type CloudinaryResourceType = 'image' | 'raw' | 'video' | 'auto';

export type CloudinaryConfig = {
  cloudName?: string;
  apiKey?: string;
  apiSecret?: string;
};

export type CloudinaryUploadInput = string | Buffer;

export type CloudinaryUploadResult = {
  secureUrl: string;
  publicId: string;
  resourceType: string;
  format: string | null;
  bytes: number;
  assetId?: string;
};

export type CloudinaryAssetMetadata = CloudinaryUploadResult & {
  createdAt?: string;
  width?: number;
  height?: number;
};

export type CloudinaryUploadOptions = {
  domain: CloudinaryDomain;
  mimeType: string;
  bytes: number;
  timeoutMs?: number;
};

export type CloudinarySdk = {
  config(options: { cloud_name: string; api_key: string; api_secret: string }): unknown;
  url(publicId: string, options?: Record<string, unknown>): string;
  uploader: {
    upload(
      file: CloudinaryUploadInput,
      options: UploadApiOptions
    ): Promise<UploadApiResponse>;
    destroy(
      publicId: string,
      options: { resource_type: CloudinaryResourceType; invalidate: boolean }
    ): Promise<{ result: string }>;
  };
  api: {
    resource(
      publicId: string,
      options: { resource_type: CloudinaryResourceType; type: 'upload' | 'authenticated' }
    ): Promise<UploadApiResponse>;
  };
};

