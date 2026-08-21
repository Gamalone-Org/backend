/**
 * Application Error Class
 * Centralized error handling
 */
export type AppErrorDetails = Record<string, unknown>;

export class AppError extends Error {
  public readonly details?: AppErrorDetails;

  constructor(
    public statusCode: number,
    public message: string,
    public code: string = 'INTERNAL_SERVER_ERROR',
    details?: AppErrorDetails
  ) {
    super(message);
    this.name = 'AppError';
    this.details = details;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  toJSON() {
    return {
      success: false,
      message: this.message,
      code: this.code,
    };
  }
}

export class SmsProviderError extends AppError {
  constructor(
    message: string,
    code: string,
    statusCode: number,
    details?: AppErrorDetails
  ) {
    super(statusCode, message, code, details);
    Object.setPrototypeOf(this, SmsProviderError.prototype);
  }
}

export class SmsSenderInvalidError extends SmsProviderError {
  constructor(details?: AppErrorDetails) {
    super("Le service SMS a refusé l'expéditeur configuré.", 'SMS_SENDER_INVALID', 502, details);
    Object.setPrototypeOf(this, SmsSenderInvalidError.prototype);
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message, 'VALIDATION_ERROR');
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Resource not found') {
    super(404, message, 'RESOURCE_NOT_FOUND');
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized') {
    super(401, message, 'UNAUTHORIZED');
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string = 'Forbidden') {
    super(403, message, 'FORBIDDEN');
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

export class ConflictError extends AppError {
  constructor(message: string = 'Resource already exists') {
    super(409, message, 'CONFLICT');
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

export class InvalidPhoneError extends AppError {
  constructor(message: string = 'Invalid phone number') {
    super(400, message, 'INVALID_PHONE');
    Object.setPrototypeOf(this, InvalidPhoneError.prototype);
  }
}

export class InvalidOtpError extends AppError {
  constructor(message: string = 'Invalid OTP') {
    super(400, message, 'INVALID_OTP');
    Object.setPrototypeOf(this, InvalidOtpError.prototype);
  }
}

export class OtpExpiredError extends AppError {
  constructor(message: string = 'OTP expired') {
    super(401, message, 'OTP_EXPIRED');
    Object.setPrototypeOf(this, OtpExpiredError.prototype);
  }
}

export class OtpAlreadyUsedError extends AppError {
  constructor(message: string = 'OTP already used') {
    super(409, message, 'OTP_ALREADY_USED');
    Object.setPrototypeOf(this, OtpAlreadyUsedError.prototype);
  }
}

export class OtpBlockedError extends AppError {
  constructor(message: string = 'OTP blocked') {
    super(423, message, 'OTP_BLOCKED');
    Object.setPrototypeOf(this, OtpBlockedError.prototype);
  }
}

export class OtpCooldownError extends AppError {
  constructor(message: string = 'Please wait before requesting a new OTP') {
    super(429, message, 'OTP_COOLDOWN');
    Object.setPrototypeOf(this, OtpCooldownError.prototype);
  }
}

export class OtpResendCooldownError extends AppError {
  constructor(message: string = 'Please wait before requesting another OTP.') {
    super(429, message, 'OTP_RESEND_COOLDOWN');
    Object.setPrototypeOf(this, OtpResendCooldownError.prototype);
  }
}

export class OtpRateLimitedError extends AppError {
  constructor(message: string = 'Too many OTP requests') {
    super(429, message, 'OTP_RATE_LIMITED');
    Object.setPrototypeOf(this, OtpRateLimitedError.prototype);
  }
}
