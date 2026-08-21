import { AppError } from '../../../common/errors/AppError.js';

export class CloudinaryConfigurationError extends AppError {
  constructor() {
    super(500, 'Cloudinary storage is not configured', 'CLOUDINARY_CONFIG_ERROR');
    Object.setPrototypeOf(this, CloudinaryConfigurationError.prototype);
  }
}

export class CloudinaryUploadError extends AppError {
  constructor() {
    super(502, 'File upload failed', 'CLOUDINARY_UPLOAD_ERROR');
    Object.setPrototypeOf(this, CloudinaryUploadError.prototype);
  }
}

export class CloudinaryDeleteError extends AppError {
  constructor() {
    super(502, 'File deletion failed', 'CLOUDINARY_DELETE_ERROR');
    Object.setPrototypeOf(this, CloudinaryDeleteError.prototype);
  }
}

export class CloudinaryMetadataError extends AppError {
  constructor() {
    super(502, 'File metadata could not be retrieved', 'CLOUDINARY_METADATA_ERROR');
    Object.setPrototypeOf(this, CloudinaryMetadataError.prototype);
  }
}

export class CloudinaryTimeoutError extends AppError {
  constructor() {
    super(504, 'Cloudinary request timed out', 'CLOUDINARY_TIMEOUT');
    Object.setPrototypeOf(this, CloudinaryTimeoutError.prototype);
  }
}

export class CloudinaryNetworkError extends AppError {
  constructor() {
    super(503, 'Cloudinary storage is temporarily unavailable', 'CLOUDINARY_NETWORK_ERROR');
    Object.setPrototypeOf(this, CloudinaryNetworkError.prototype);
  }
}

export class CloudinaryValidationError extends AppError {
  constructor(message: string) {
    super(400, message, 'CLOUDINARY_VALIDATION_ERROR');
    Object.setPrototypeOf(this, CloudinaryValidationError.prototype);
  }
}
