import { randomInt, createHash } from 'node:crypto';
import type { OtpPurpose } from '../../../generated/prisma/client.js';
import { env, otpConfig } from '../../../config/index.js';
import { InvalidOtpError, OtpAlreadyUsedError, OtpBlockedError, OtpCooldownError, OtpExpiredError, OtpRateLimitedError, OtpResendCooldownError } from '../../../common/errors/AppError.js';
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
  private readonly ipRateLimitMap = new Map<string, { count: number; windowStart: number }>();
  private readonly phoneLockMap = new Map<string, Promise<void>>();

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

  private resolveIp(ip?: string): string {
    if (!ip) {
      return 'unknown';
    }

    const forwardedIp = ip.split(',')[0]?.trim();
    return forwardedIp || 'unknown';
  }

  private async withPhoneLock<T>(phone: string, work: () => Promise<T>): Promise<T> {
    const previous = this.phoneLockMap.get(phone) ?? Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.phoneLockMap.set(phone, previous.then(() => current));

    await previous;

    try {
      return await work();
    } finally {
      release();
      if (this.phoneLockMap.get(phone) === current) {
        this.phoneLockMap.delete(phone);
      }
    }
  }

  async checkRateLimit(phone: string, ip: string | undefined, purpose: OtpPurpose): Promise<void> {
    const normalizedPhone = this.phoneService.normalize(phone);
    const since = new Date(Date.now() - 15 * 60 * 1000);
    const recentPhoneRequests = await this.otpRepository.countRecentByPhone(normalizedPhone, since);

    if (recentPhoneRequests >= otpConfig.rateLimitPerPhone) {
      throw new OtpRateLimitedError('Too many OTP requests for this phone');
    }

    const clientIp = this.resolveIp(ip);
    if (clientIp !== 'unknown') {
      const ipKey = `${purpose}:${clientIp}`;
      const ipState = this.ipRateLimitMap.get(ipKey);
      const now = Date.now();

      if (!ipState || now - ipState.windowStart > 15 * 60 * 1000) {
        this.ipRateLimitMap.set(ipKey, { count: 1, windowStart: now });
      } else if (ipState.count >= otpConfig.rateLimitPerIp) {
        throw new OtpRateLimitedError('Too many OTP requests from this IP');
      } else {
        ipState.count += 1;
      }
    }
  }

  async canSendOtp(phone: string, purpose: OtpPurpose): Promise<boolean> {
    const normalizedPhone = this.phoneService.normalize(phone);
    const lastOtp = await this.otpRepository.findLatestByPhoneAndPurpose(normalizedPhone, purpose);

    if (!lastOtp) {
      return true;
    }

    const lastSentAt = lastOtp.lastSentAt ?? new Date(0);
    const elapsedMs = Date.now() - lastSentAt.getTime();
    const requiredCooldownMs = Math.max(otpConfig.cooldownSeconds, otpConfig.resendCooldownSeconds) * 1000;
    return elapsedMs >= requiredCooldownMs;
  }

  async checkResendCooldown(phone: string, purpose: OtpPurpose): Promise<void> {
    const normalizedPhone = this.phoneService.normalize(phone);
    const lastOtp = await this.otpRepository.findLatestByPhoneAndPurpose(normalizedPhone, purpose);

    if (!lastOtp?.lastSentAt) {
      return;
    }

    const elapsedMs = Date.now() - lastOtp.lastSentAt.getTime();
    const requiredCooldownMs = otpConfig.resendCooldownSeconds * 1000;

    if (elapsedMs < requiredCooldownMs) {
      throw new OtpResendCooldownError('Please wait before requesting another OTP.');
    }
  }

  async createOtp({ phone, userId, purpose }: CreateOtpInput): Promise<{ code: string; expiresAt: Date }> {
    const normalizedPhone = this.phoneService.normalize(phone);

    return this.withPhoneLock(normalizedPhone, async () => {
      await this.checkRateLimit(normalizedPhone, 'unknown', purpose);

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
    });
  }

  async resendOtp({ phone, userId, purpose, ip }: CreateOtpInput & { ip?: string }): Promise<{ code: string; expiresAt: Date }> {
    const normalizedPhone = this.phoneService.normalize(phone);

    return this.withPhoneLock(normalizedPhone, async () => {
      await this.checkRateLimit(normalizedPhone, ip, purpose);
      await this.checkResendCooldown(normalizedPhone, purpose);
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
    });
  }

  async getLastCodeForPhone(phone: string, purpose: OtpPurpose): Promise<{ code: string; expiresAt: Date } | null> {
    const normalizedPhone = this.phoneService.normalize(phone);
    const otp = await this.otpRepository.findLatestByPhoneAndPurpose(normalizedPhone, purpose);

    if (!otp) {
      return null;
    }

    return {
      code: otp.codeHash,
      expiresAt: otp.expiresAt,
    };
  }

  async verifyOtp({ phone, code, purpose }: VerifyOtpInput): Promise<boolean> {
    const normalizedPhone = this.phoneService.normalize(phone);

    return this.withPhoneLock(normalizedPhone, async () => {
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
    });
  }
}
