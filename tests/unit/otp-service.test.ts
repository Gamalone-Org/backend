import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'postgresql://user:password@localhost:5432/gamalone_test';
});

import { OtpPurpose, OtpStatus } from '../../generated/prisma/client';
import { OtpService } from '../../src/modules/auth/services/OtpService';
import { PhoneService } from '../../src/modules/auth/services/PhoneService';
import { InvalidOtpError, OtpCooldownError, OtpExpiredError, OtpResendCooldownError } from '../../src/common/errors/AppError';

describe('OtpService', () => {
  const phone = '+22890123456';

  const createRepository = () => ({
    create: vi.fn(),
    findLatestByPhoneAndPurpose: vi.fn(),
    findLatestActiveByPhoneAndPurpose: vi.fn(),
    invalidateActiveByPhoneAndPurpose: vi.fn(),
    incrementAttempts: vi.fn(),
    markUsed: vi.fn(),
    markExpired: vi.fn(),
    markBlocked: vi.fn(),
    countRecentByPhone: vi.fn().mockResolvedValue(0),
  });

  let repo: ReturnType<typeof createRepository>;
  let service: OtpService;

  beforeEach(() => {
    repo = createRepository();
    service = new OtpService(repo as any, new PhoneService());
  });

  it('generates a 6-digit otp', () => {
    const code = service.generateOtp();
    expect(code).toMatch(/^\d{6}$/);
  });

  it('creates an otp and stores only the hash', async () => {
    repo.findLatestByPhoneAndPurpose.mockResolvedValue(null);
    repo.invalidateActiveByPhoneAndPurpose.mockResolvedValue(1);
    repo.create.mockImplementation(async (data) => ({
      id: '1',
      phone: data.phone,
      purpose: data.purpose,
      status: OtpStatus.EN_ATTENTE,
      codeHash: data.codeHash,
      expiresAt: data.expiresAt,
      maxAttempts: data.maxAttempts,
      attemptCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      usedAt: null,
      lastSentAt: data.lastSentAt,
      userId: data.userId ?? null,
    }));

    const result = await service.createOtp({ phone, purpose: OtpPurpose.LOGIN });

    expect(repo.invalidateActiveByPhoneAndPurpose).toHaveBeenCalledWith(phone, OtpPurpose.LOGIN);
    expect(result.code).toMatch(/^\d{6}$/);
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        phone,
        purpose: OtpPurpose.LOGIN,
        userId: null,
      })
    );
  });

  it('rejects expired otp', async () => {
    repo.findLatestActiveByPhoneAndPurpose.mockResolvedValue({
      id: '1',
      phone,
      purpose: OtpPurpose.LOGIN,
      codeHash: 'hash',
      status: OtpStatus.EN_ATTENTE,
      expiresAt: new Date(Date.now() - 1000),
      maxAttempts: 5,
      attemptCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      usedAt: null,
      lastSentAt: new Date(),
      userId: null,
    });
    repo.markExpired.mockResolvedValue({});

    await expect(service.verifyOtp({ phone, code: '123456', purpose: OtpPurpose.LOGIN })).rejects.toThrow(OtpExpiredError);
  });

  it('rejects an incorrect otp and increments attempts', async () => {
    repo.findLatestActiveByPhoneAndPurpose.mockResolvedValue({
      id: '1',
      phone,
      purpose: OtpPurpose.LOGIN,
      codeHash: 'hash',
      status: OtpStatus.EN_ATTENTE,
      expiresAt: new Date(Date.now() + 60000),
      maxAttempts: 5,
      attemptCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      usedAt: null,
      lastSentAt: new Date(),
      userId: null,
    });
    repo.incrementAttempts.mockResolvedValue({});

    await expect(service.verifyOtp({ phone, code: '000000', purpose: OtpPurpose.LOGIN })).rejects.toThrow(InvalidOtpError);
    expect(repo.incrementAttempts).toHaveBeenCalledWith('1');
  });

  it('creates a resend flow that invalidates the previous OTP and returns a fresh code', async () => {
    repo.findLatestByPhoneAndPurpose.mockResolvedValue({
      id: 'old-1',
      phone,
      purpose: OtpPurpose.LOGIN,
      status: OtpStatus.EN_ATTENTE,
      codeHash: 'old-hash',
      expiresAt: new Date(Date.now() + 60000),
      attemptCount: 0,
      maxAttempts: 5,
      createdAt: new Date(Date.now() - 50000),
      updatedAt: new Date(Date.now() - 50000),
      usedAt: null,
      lastSentAt: new Date(Date.now() - 50000),
      userId: null,
    });
    repo.countRecentByPhone.mockResolvedValue(0);
    repo.invalidateActiveByPhoneAndPurpose.mockResolvedValue(1);
    repo.create.mockImplementation(async (data) => ({
      id: 'new-1',
      phone: data.phone,
      purpose: data.purpose,
      status: OtpStatus.EN_ATTENTE,
      codeHash: data.codeHash,
      expiresAt: data.expiresAt,
      maxAttempts: data.maxAttempts,
      attemptCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
      usedAt: null,
      lastSentAt: data.lastSentAt,
      userId: data.userId ?? null,
    }));

    const result = await service.resendOtp({ phone, purpose: OtpPurpose.LOGIN, ip: '203.0.113.10' });

    expect(repo.invalidateActiveByPhoneAndPurpose).toHaveBeenCalledWith(phone, OtpPurpose.LOGIN);
    expect(result.code).toMatch(/^\d{6}$/);
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(repo.create).toHaveBeenCalledTimes(1);
  });

  it('rejects a resend before the cooldown ends', async () => {
    repo.findLatestByPhoneAndPurpose.mockResolvedValue({
      id: '1',
      phone,
      purpose: OtpPurpose.LOGIN,
      status: OtpStatus.EN_ATTENTE,
      codeHash: 'hash',
      expiresAt: new Date(Date.now() + 60000),
      attemptCount: 0,
      maxAttempts: 5,
      createdAt: new Date(),
      updatedAt: new Date(),
      usedAt: null,
      lastSentAt: new Date(Date.now() - 2000),
      userId: null,
    });

    await expect(service.resendOtp({ phone, purpose: OtpPurpose.LOGIN, ip: '203.0.113.10' })).rejects.toThrow(OtpResendCooldownError);
  });
});
