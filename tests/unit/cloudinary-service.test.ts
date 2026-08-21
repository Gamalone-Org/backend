import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CloudinaryConfigurationError,
  CloudinaryDeleteError,
  CloudinaryMetadataError,
  CloudinaryNetworkError,
  CloudinaryService,
  CloudinaryTimeoutError,
  CloudinaryUploadError,
  CloudinaryValidationError,
  createCloudinaryClient,
} from '../../src/shared/services/cloudinary/index.js';

const uploadResponse = {
  secure_url: 'https://res.cloudinary.com/demo/image/upload/sample.jpg',
  public_id: 'gamalone/media/sample',
  resource_type: 'image',
  format: 'jpg',
  bytes: 1234,
  asset_id: 'asset-1',
};

function createClient() {
  return {
    config: vi.fn(),
    url: vi.fn().mockReturnValue('https://res.cloudinary.com/signed-url'),
    uploader: {
      upload: vi.fn().mockResolvedValue(uploadResponse),
      destroy: vi.fn().mockResolvedValue({ result: 'ok' }),
    },
    api: {
      resource: vi.fn().mockResolvedValue(uploadResponse),
    },
  };
}

describe('CloudinaryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('accepts complete configuration without exposing the secret', () => {
    const client = createCloudinaryClient({
      cloudName: 'cloud',
      apiKey: 'key',
      apiSecret: 'secret',
    });

    expect(client).toBeDefined();
    expect(JSON.stringify(client)).not.toContain('secret');
  });

  it('rejects incomplete configuration', () => {
    expect(() => createCloudinaryClient({ cloudName: 'cloud', apiKey: 'key' })).toThrow(CloudinaryConfigurationError);
  });

  it('uploads and normalizes an image response', async () => {
    const client = createClient();
    const service = new CloudinaryService(client as any);

    const result = await service.uploadImage(Buffer.from('image'), {
      domain: 'media',
      mimeType: 'image/jpeg',
      bytes: 5,
    });

    expect(result).toEqual({
      secureUrl: uploadResponse.secure_url,
      publicId: uploadResponse.public_id,
      resourceType: 'image',
      format: 'jpg',
      bytes: 1234,
      assetId: 'asset-1',
    });
    expect(client.uploader.upload).toHaveBeenCalledWith('data:image/jpeg;base64,aW1hZ2U=', {
      resource_type: 'image',
      type: 'upload',
      folder: 'gamalone/media',
    });
  });

  it('uploads documents as authenticated raw assets', async () => {
    const client = createClient();
    const service = new CloudinaryService(client as any);

    await service.uploadDocument('document.pdf', {
      domain: 'kyc',
      mimeType: 'application/pdf',
      bytes: 10,
    });

    expect(client.uploader.upload).toHaveBeenCalledWith('document.pdf', {
      resource_type: 'raw',
      type: 'authenticated',
      folder: 'gamalone/kyc',
    });
  });

  it('rejects unsupported MIME types and oversized files', async () => {
    const service = new CloudinaryService(createClient() as any, 10);

    expect(() => service.uploadImage('file', {
      domain: 'media',
      mimeType: 'image/gif',
      bytes: 1,
    })).toThrow(CloudinaryValidationError);
    expect(() => service.uploadFile('file', {
      domain: 'media',
      mimeType: 'application/octet-stream',
      bytes: 11,
    })).toThrow(CloudinaryValidationError);
  });

  it('normalizes Cloudinary upload errors', async () => {
    const client = createClient();
    client.uploader.upload.mockRejectedValue(new Error('provider details'));
    const service = new CloudinaryService(client as any);

    await expect(service.uploadImage('file', {
      domain: 'media',
      mimeType: 'image/png',
      bytes: 1,
    })).rejects.toBeInstanceOf(CloudinaryUploadError);
  });

  it('maps network and timeout failures separately', async () => {
    const networkClient = createClient();
    networkClient.uploader.upload.mockRejectedValue(new TypeError('network failed'));
    const networkService = new CloudinaryService(networkClient as any);
    await expect(networkService.uploadImage('file', {
      domain: 'media',
      mimeType: 'image/png',
      bytes: 1,
    })).rejects.toBeInstanceOf(CloudinaryNetworkError);

    const timeoutClient = createClient();
    timeoutClient.uploader.upload.mockReturnValue(new Promise(() => undefined));
    const timeoutService = new CloudinaryService(timeoutClient as any, 100, 1);
    await expect(timeoutService.uploadImage('file', {
      domain: 'media',
      mimeType: 'image/png',
      bytes: 1,
    })).rejects.toBeInstanceOf(CloudinaryTimeoutError);
  });

  it('deletes an asset using its public ID and resource type', async () => {
    const client = createClient();
    const service = new CloudinaryService(client as any);

    await expect(service.deleteAsset('gamalone/media/sample', 'image')).resolves.toBeUndefined();
    expect(client.uploader.destroy).toHaveBeenCalledWith('gamalone/media/sample', {
      resource_type: 'image',
      invalidate: true,
    });
  });

  it('normalizes deletion failures and rejects unsafe public IDs', async () => {
    const client = createClient();
    client.uploader.destroy.mockRejectedValue(new Error('provider details'));
    const service = new CloudinaryService(client as any);

    await expect(service.deleteAsset('gamalone/media/sample')).rejects.toBeInstanceOf(CloudinaryDeleteError);
    await expect(service.deleteAsset('../secret')).rejects.toBeInstanceOf(CloudinaryValidationError);
  });

  it('gets and normalizes asset metadata', async () => {
    const client = createClient();
    const service = new CloudinaryService(client as any);

    await expect(service.getAssetMetadata('gamalone/media/sample')).resolves.toEqual({
      secureUrl: uploadResponse.secure_url,
      publicId: uploadResponse.public_id,
      resourceType: 'image',
      format: 'jpg',
      bytes: 1234,
      assetId: 'asset-1',
    });
  });

  it('normalizes metadata failures', async () => {
    const client = createClient();
    client.api.resource.mockRejectedValue(new Error('provider details'));
    const service = new CloudinaryService(client as any);

    await expect(service.getAssetMetadata('gamalone/media/sample')).rejects.toBeInstanceOf(CloudinaryMetadataError);
  });

  it('generates a signed URL for authenticated assets', () => {
    const client = createClient();
    const service = new CloudinaryService(client as any);

    const signedUrl = service.generateSignedUrl('gamalone/kyc/doc-1', 'raw', 3600);
    expect(signedUrl).toBe('https://res.cloudinary.com/signed-url');
    expect(client.url).toHaveBeenCalledWith('gamalone/kyc/doc-1', {
      resource_type: 'raw',
      type: 'authenticated',
      sign_url: true,
      expires_at: expect.any(Number),
      secure: true,
    });
  });

  it('rejects invalid public IDs when generating signed URLs', () => {
    const service = new CloudinaryService(createClient() as any);
    expect(() => service.generateSignedUrl('../unsafe/path')).toThrow(CloudinaryValidationError);
  });

  it('does not log or return Cloudinary secrets', async () => {
    const client = createClient();
    const logSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const service = new CloudinaryService(client as any);

    const result = await service.uploadImage('file', {
      domain: 'media',
      mimeType: 'image/webp',
      bytes: 1,
    });

    expect(JSON.stringify(result)).not.toContain('api_secret');
    expect(logSpy).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });
});
