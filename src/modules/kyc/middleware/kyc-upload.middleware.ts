import type { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { ValidationError } from '../../../common/errors/AppError.js';

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
  },
});

export const kycUploadMiddleware = (req: Request, res: Response, next: NextFunction): void => {
  upload.single('file')(req, res, (err) => {
    if (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          next(new ValidationError('File exceeds the maximum allowed size of 10MB'));
          return;
        }
        next(new ValidationError(`File upload error: ${err.message}`));
        return;
      }
      next(err);
      return;
    }
    next();
  });
};

/**
 * Validates the true content type using magic bytes
 * Supports PDF, JPEG, and PNG signatures.
 */
export function detectMimeTypeFromMagicBytes(buffer: Buffer): string | null {
  if (!buffer || buffer.length < 4) {
    return null;
  }

  // PDF signature: %PDF- (0x25 0x50 0x44 0x46 0x2D)
  if (
    buffer.length >= 5 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46 &&
    buffer[4] === 0x2D
  ) {
    return 'application/pdf';
  }

  // JPEG signature: 0xFF 0xD8 0xFF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return 'image/jpeg';
  }

  // PNG signature: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return 'image/png';
  }

  return null;
}
