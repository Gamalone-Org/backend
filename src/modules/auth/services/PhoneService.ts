import { InvalidPhoneError } from '../../../common/errors/AppError.js';

export class PhoneService {
  normalize(phone: string): string {
    const trimmed = phone.trim();

    if (!trimmed) {
      throw new InvalidPhoneError('Phone number is required');
    }

    const digitsOnly = trimmed.replace(/\s+/g, '').replace(/[^\d+]/g, '');

    if (!digitsOnly) {
      throw new InvalidPhoneError('Phone number is invalid');
    }

    const normalized = digitsOnly.startsWith('+') ? digitsOnly : `+${digitsOnly.replace(/^00/, '')}`;

    if (!this.isValid(normalized)) {
      throw new InvalidPhoneError('Phone number format is invalid');
    }

    return normalized;
  }

  validate(phone: string): string {
    return this.normalize(phone);
  }

  isValid(phone: string): boolean {
    if (!phone || typeof phone !== 'string') {
      return false;
    }

    const trimmed = phone.trim();

    if (!trimmed) {
      return false;
    }

    if (!/^\+\d{8,15}$/.test(trimmed)) {
      return false;
    }

    const digits = trimmed.slice(1);
    return digits.length >= 8 && digits.length <= 15 && /^\d+$/.test(digits);
  }

  compare(phone1: string, phone2: string): boolean {
    try {
      return this.normalize(phone1) === this.normalize(phone2);
    } catch {
      return false;
    }
  }
}
