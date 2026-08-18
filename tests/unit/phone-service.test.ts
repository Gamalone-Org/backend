import { describe, expect, it } from 'vitest';
import { PhoneService } from '../../src/modules/auth/services/PhoneService';
import { InvalidPhoneError } from '../../src/common/errors/AppError';

describe('PhoneService', () => {
  const phoneService = new PhoneService();

  it('normalizes a valid phone number to E.164', () => {
    expect(phoneService.normalize(' +228 90 12 34 56 ')).toBe('+22890123456');
    expect(phoneService.normalize('0022890123456')).toBe('+22890123456');
  });

  it('validates valid numbers', () => {
    expect(phoneService.isValid('+22890123456')).toBe(true);
    expect(phoneService.isValid('+221771234567')).toBe(true);
  });

  it('rejects invalid phone numbers', () => {
    expect(() => phoneService.normalize('abc')).toThrow(InvalidPhoneError);
    expect(phoneService.isValid('123')).toBe(false);
  });

  it('compares numbers consistently', () => {
    expect(phoneService.compare('+22890123456', '0022890123456')).toBe(true);
    expect(phoneService.compare('+22890123456', '+22890123457')).toBe(false);
  });
});
