import { randomInt, createHash } from 'node:crypto';
import type { OtpPurpose } from '../../../../generated/prisma/client';
import { env, otpConfig } from '../../../config/index.js';
import { InvalidOtpError, OtpAlreadyUsedError, OtpBlockedError, OtpCooldownError, OtpExpiredError } from '../../../common/errors/AppError.js';
import { PhoneService } from './PhoneService.js';
import { OtpRepository } from '../repositories/OtpRepository.js';

export type CreateOtpInput = {
  phone: string;
  userId?: string | null;
  purpose: OtpPurpose;
};

export type VerifyOtpInput = {
  phone: string;
  code: string;
  purpose: OtpPurpose;
};

export class OtpService {
  constructor(
    private readonly otpRepository: OtpRepository,
    private readonly phoneService: PhoneService,
    private readonly otpLength = 6
  ) {}

  generateOtp(): string {
    const min = 10 ** (this.otpLength - 1);
    const max = 10 ** this.otpLength - 1;
    return randomInt(min, max + 1).toString().padStart(this.otpLength, '0');
  }

  private hashOtp(code: string): string {
    return createHash('sha256').update(code).digest('hex');
  }

  async canSendOtp(phone: string, purpose: OtpPurpose): Promise<boolean> {
    const normalizedPhone = this.phoneService.normalize(phone);
    const lastOtp = await this.otpRepository.findLatestByPhoneAndPurpose(normalizedPhone, purpose);

    if (!lastOtp) {
      return true;
    }

    const lastSentAt = lastOtp.lastSentAt ?? new Date(0);
    const elapsedMs = Date.now() - lastSentAt.getTime();
    return elapsedMs >= otpConfig.cooldownSeconds * 1000;
  }

  async createOtp({ phone, userId, purpose }: CreateOtpInput): Promise<{ code: string; expiresAt: Date }> {
    const normalizedPhone = this.phoneService.normalize(phone);

    if (!(await this.canSendOtp(normalizedPhone, purpose))) {
      throw new OtpCooldownError('A new OTP can only be requested after the cooldown period');
    }

    await this.otpRepository.invalidateActiveByPhoneAndPurpose(normalizedPhone, purpose);

    const code = this.generateOtp();
    const codeHash = this.hashOtp(code);
    const expiresAt = new Date(Date.now() + env.OTP_TTL_SECONDS * 1000);

    await this.otpRepository.create({
      phone: normalizedPhone,
      userId: userId ?? null,
      codeHash,
      purpose,
      expiresAt,
      maxAttempts: env.OTP_MAX_ATTEMPTS,
      lastSentAt: new Date(),
    });

    return {
      code,
      expiresAt,
    };
  }

  async verifyOtp({ phone, code, purpose }: VerifyOtpInput): Promise<boolean> {
    const normalizedPhone = this.phoneService.normalize(phone);

    const otp = await this.otpRepository.findLatestActiveByPhoneAndPurpose(normalizedPhone, purpose);

    if (!otp) {
      throw new InvalidOtpError('OTP is invalid');
    }

    if (otp.status === 'UTILISE') {
      throw new OtpAlreadyUsedError();
    }

    if (otp.status === 'EXPIRE') {
      throw new OtpExpiredError();
    }

    if (otp.status === 'BLOQUE') {
      throw new OtpBlockedError();
    }

    if (new Date() > otp.expiresAt) {
      await this.otpRepository.markExpired(otp.id);
      throw new OtpExpiredError();
    }

    const suppliedHash = this.hashOtp(code.trim());
    const isValid = suppliedHash === otp.codeHash;

    if (!isValid) {
      const updated = await this.otpRepository.incrementAttempts(otp.id);
      if (updated.attemptCount >= otp.maxAttempts) {
        await this.otpRepository.markBlocked(otp.id);
      }
      throw new InvalidOtpError('OTP code is incorrect');
    }

    await this.otpRepository.markUsed(otp.id);
    return true;
  }
}
