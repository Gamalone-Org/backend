import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OtpPurpose } from '../../src/generated/prisma/client.js';
import { AuthRepository } from '../../src/modules/auth/repositories/AuthRepository';
import { AuthService } from '../../src/modules/auth/services/AuthService';
import { JwtService } from '../../src/modules/auth/services/JwtService';
import { PhoneService } from '../../src/modules/auth/services/PhoneService';
import { OtpRateLimitedError } from '../../src/common/errors/AppError';

describe('Auth security hardening', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates users with a non-verified phone status until OTP validation succeeds', async () => {
    const prismaUser = {
      create: vi.fn().mockResolvedValue({
        id: 'user-1',
        telephone: '+22890123456',
        role: 'ACHETEUR',
        statut: 'EN_ATTENTE_VALIDATION',
        telephoneVerificationStatus: 'NON_VERIFIE',
        telephoneVerifiedAt: null,
      }),
    };

    const repository = new AuthRepository({ user: prismaUser } as any);

    await repository.createUser('+22890123456', 'ACHETEUR');

    expect(prismaUser.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        telephone: '+22890123456',
        role: 'ACHETEUR',
        statut: 'EN_ATTENTE_VALIDATION',
        telephoneVerificationStatus: 'NON_VERIFIE',
        telephoneVerifiedAt: null,
      }),
    });
  });

  it('resends OTP using the same rate-limit and cooldown protections as the first send', async () => {
    const otpService = {
      createOtp: vi.fn().mockResolvedValue({ code: '123456', expiresAt: new Date(Date.now() + 300000) }),
      resendOtp: vi.fn().mockResolvedValue({ code: '654321', expiresAt: new Date(Date.now() + 300000) }),
      verifyOtp: vi.fn(),
      checkRateLimit: vi.fn().mockResolvedValue(undefined),
      checkResendCooldown: vi.fn().mockResolvedValue(undefined),
    };

    const smsService = { sendOtp: vi.fn().mockResolvedValue(undefined), sendNotification: vi.fn() };

    const authService = new AuthService(
      {
        findByPhone: vi.fn().mockResolvedValue(null),
        createUser: vi.fn(),
        updatePhoneVerification: vi.fn(),
      } as any,
      otpService as any,
      new PhoneService(),
      smsService as any,
      new JwtService('12345678901234567890123456789012')
    );

    const result = await authService.resendOtp('+22890123456', '127.0.0.1');

    expect(result).toHaveProperty('message', 'OTP resent');
    expect(otpService.resendOtp).toHaveBeenCalledWith({
      phone: '+22890123456',
      userId: null,
      purpose: OtpPurpose.PHONE_VERIFICATION,
      ip: '127.0.0.1',
    });
    expect(smsService.sendOtp).toHaveBeenCalledTimes(1);
    expect(smsService.sendOtp.mock.calls[0][0]).toBe('+22890123456');
  });

  it('blocks OTP requests when the phone rate limit is exceeded', async () => {
    const otpService = {
      createOtp: vi.fn(),
      verifyOtp: vi.fn(),
      checkRateLimit: vi.fn().mockRejectedValue(new OtpRateLimitedError('Too many OTP requests for this phone')),
    };

    const authService = new AuthService(
      {
        findByPhone: vi.fn().mockResolvedValue(null),
        createUser: vi.fn(),
        updatePhoneVerification: vi.fn(),
      } as any,
      otpService as any,
      new PhoneService(),
      { sendOtp: vi.fn() } as any,
      new JwtService('12345678901234567890123456789012')
    );

    await expect(authService.requestOtp('+22890123456', '127.0.0.1')).rejects.toThrow(OtpRateLimitedError);
    expect(otpService.checkRateLimit).toHaveBeenCalledWith('+22890123456', '127.0.0.1', OtpPurpose.PHONE_VERIFICATION);
  });

  it('blocks OTP requests when the IP rate limit is exceeded', async () => {
    const otpService = {
      createOtp: vi.fn(),
      verifyOtp: vi.fn(),
      checkRateLimit: vi.fn().mockRejectedValue(new OtpRateLimitedError('Too many OTP requests from this IP')),
    };

    const authService = new AuthService(
      {
        findByPhone: vi.fn().mockResolvedValue(null),
        createUser: vi.fn(),
        updatePhoneVerification: vi.fn(),
      } as any,
      otpService as any,
      new PhoneService(),
      { sendOtp: vi.fn() } as any,
      new JwtService('12345678901234567890123456789012')
    );

    await expect(authService.requestOtp('+22890123456', '203.0.113.10')).rejects.toThrow(OtpRateLimitedError);
    expect(otpService.checkRateLimit).toHaveBeenCalledWith('+22890123456', '203.0.113.10', OtpPurpose.PHONE_VERIFICATION);
  });
});
