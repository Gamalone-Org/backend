import { v2 as cloudinary } from 'cloudinary';
import { cloudinaryConfig } from '../../../config/cloudinary.js';
import { CloudinaryConfigurationError } from './cloudinary.errors.js';
import type { CloudinaryConfig, CloudinarySdk } from './cloudinary.types.js';

export function createCloudinaryClient(config: CloudinaryConfig = cloudinaryConfig): CloudinarySdk {
  if (!config.cloudName || !config.apiKey || !config.apiSecret) {
    throw new CloudinaryConfigurationError();
  }

  cloudinary.config({
    cloud_name: config.cloudName,
    api_key: config.apiKey,
    api_secret: config.apiSecret,
  });

  return cloudinary as unknown as CloudinarySdk;
}
