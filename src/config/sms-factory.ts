import { AfrikSmsProvider } from '../modules/notifications/AfrikSmsProvider.js';
import { FakeSmsService } from '../modules/auth/interfaces/SmsService.js';
import type { SmsService } from '../modules/auth/interfaces/SmsService.js';
import { smsConfig, afriksmsConfig } from './otp.js';
import { AppError } from '../common/errors/AppError.js';

/**
 * Factory function to create the appropriate SmsService provider
 * based on the SMS_PROVIDER environment variable
 */
export function createSmsService(): SmsService {
  const provider = smsConfig.provider;

  if (provider === 'mock' || !provider) {
    return new FakeSmsService();
  }

  if (provider === 'afriksms') {
    const hasCredentials = Boolean(afriksmsConfig.clientId && afriksmsConfig.apiKey && afriksmsConfig.senderId);
    if (!hasCredentials) {
      return new FakeSmsService();
    }
    return new AfrikSmsProvider(afriksmsConfig);
  }

  if (provider === 'twilio' || provider === 'messagebird' || provider === 'custom') {
    return new FakeSmsService();
  }

  const _exhaustive: never = provider;
  throw new AppError(
    500,
    `Unknown SMS provider: ${_exhaustive}`,
    'SMS_PROVIDER_UNKNOWN'
  );
}
