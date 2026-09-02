import type { PrismaClient } from '../../generated/prisma/client.js';
import type { MediaType } from '../../generated/prisma/client.js';
import type { CloudinaryService } from '../../shared/services/cloudinary/index.js';
import type {
  CloudinaryUploadInput,
  CloudinaryUploadOptions,
} from '../../shared/services/cloudinary/index.js';

export class MediaRepository {
  private cloudinaryInstance: CloudinaryService | undefined;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly cloudinaryFactory: () => CloudinaryService
  ) {}

  private get cloudinary(): CloudinaryService {
    if (!this.cloudinaryInstance) {
      this.cloudinaryInstance = this.cloudinaryFactory();
    }
    return this.cloudinaryInstance;
  }

  async uploadAndCreate(
    file: CloudinaryUploadInput,
    options: CloudinaryUploadOptions,
    metadata: { width?: number; height?: number },
    oeuvreId: string,
    nextOrdre: number,
    type: MediaType = 'OEUVRE'
  ) {
    const result = await this.cloudinary.uploadImage(file, options);

    return this.prisma.media.create({
      data: {
        url: result.secureUrl,
        publicId: result.publicId,
        mimeType: options.mimeType,
        size: options.bytes,
        width: metadata.width ?? null,
        height: metadata.height ?? null,
        ordre: nextOrdre,
        type,
        oeuvreId,
      },
    });
  }

  async uploadAtelier(file: CloudinaryUploadInput, options: CloudinaryUploadOptions) {
    const result = await this.cloudinary.uploadImage(file, options);
    return {
      url: result.secureUrl,
      publicId: result.publicId,
      mimeType: options.mimeType,
      size: options.bytes,
    };
  }

  async deleteMediaAndCloudinary(mediaId: string) {
    const media = await this.prisma.media.findUnique({ where: { id: mediaId } });
    if (!media) return null;

    await this.cloudinary.deleteAsset(media.publicId, 'image');

    return this.prisma.media.delete({ where: { id: mediaId } });
  }

  async deleteAsset(publicId: string) {
    return this.cloudinary.deleteAsset(publicId, 'image');
  }

  async getMaxOrdre(oeuvreId: string, type?: MediaType): Promise<number> {
    const result = await this.prisma.media.findFirst({
      where: { oeuvreId, ...(type ? { type } : {}) },
      orderBy: { ordre: 'desc' },
      select: { ordre: true },
    });
    return result?.ordre ?? -1;
  }
}
