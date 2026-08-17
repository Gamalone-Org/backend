import { env } from './env.js';

/**
 * Cloudinary configuration
 * Optional for media storage and image processing
 */
export const cloudinaryConfig = {
  cloudName: env.CLOUDINARY_CLOUD_NAME,
  apiKey: env.CLOUDINARY_API_KEY,
  apiSecret: env.CLOUDINARY_API_SECRET,
  isEnabled: !!env.CLOUDINARY_CLOUD_NAME && !!env.CLOUDINARY_API_KEY && !!env.CLOUDINARY_API_SECRET,
};
