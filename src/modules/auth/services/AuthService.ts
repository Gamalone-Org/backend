import { UserRole, type User, OtpPurpose } from '../../../generated/prisma/client.js';
import { OtpService } from './OtpService.js';
import { PhoneService } from './PhoneService.js';
import { JwtService } from './JwtService.js';
import { AuthRepository } from '../repositories/AuthRepository.js';
import { createSmsService } from '../../../config/sms-factory.js';
import type { SmsService } from '../interfaces/SmsService.js';
import { InvalidOtpError, UnauthorizedError } from '../../../common/errors/AppError.js';

export type AuthUserPublic = {
  id: string;
  telephone: string;
  role: UserRole;
  statut: User['statut'];
  telephoneVerificationStatus: User['telephoneVerificationStatus'];
};

export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly otpService: OtpService,
    private readonly phoneService: PhoneService,
    private readonly smsService: SmsService = createSmsService(),
    private readonly jwtService: JwtService = new JwtService()
  ) {}

  async requestOtp(phone: string, ip?: string): Promise<{ message: string; expiresAt: Date }> {
    const normalizedPhone = this.phoneService.normalize(phone);

    await this.otpService.checkRateLimit(normalizedPhone, ip, OtpPurpose.PHONE_VERIFICATION);

    const existingUser = await this.authRepository.findByPhone(normalizedPhone);
    const userId = existingUser?.id ?? null;

    const { code, expiresAt } = await this.otpService.createOtp({
      phone: normalizedPhone,
      userId,
      purpose: OtpPurpose.PHONE_VERIFICATION,
    });

    await this.smsService.sendOtp(normalizedPhone, code);

    return {
      message: 'OTP sent successfully',
      expiresAt,
    };
  }

  async resendOtp(phone: string, ip?: string): Promise<{ message: string; expiresAt: Date }> {
    const normalizedPhone = this.phoneService.normalize(phone);

    const existingUser = await this.authRepository.findByPhone(normalizedPhone);
    const userId = existingUser?.id ?? null;

    const { code, expiresAt } = await this.otpService.resendOtp({
      phone: normalizedPhone,
      userId,
      purpose: OtpPurpose.PHONE_VERIFICATION,
      ip,
    });

    await this.smsService.sendOtp(normalizedPhone, code);

    return {
      message: 'OTP resent',
      expiresAt,
    };
  }

  async verifyOtp(phone: string, code: string): Promise<{ accessToken: string; tokenType: 'Bearer'; user: AuthUserPublic }> {
    const normalizedPhone = this.phoneService.normalize(phone);

    if (!code || code.trim().length !== 6 || !/^\d{6}$/.test(code.trim())) {
      throw new InvalidOtpError('OTP must be a 6-digit code');
    }

    await this.otpService.verifyOtp({
      phone: normalizedPhone,
      code: code.trim(),
      purpose: OtpPurpose.PHONE_VERIFICATION,
    });

    let user = await this.authRepository.findByPhone(normalizedPhone);
    if (!user) {
      user = await this.authRepository.createUser(normalizedPhone, 'ACHETEUR');
    }

    await this.authRepository.updatePhoneVerification(user.id, 'VERIFIE', new Date());

    const accessToken = this.jwtService.generateToken({
      id: user.id,
      role: user.role,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      user: {
        id: user.id,
        telephone: user.telephone,
        role: user.role,
        statut: user.statut,
        telephoneVerificationStatus: user.telephoneVerificationStatus,
      },
    };
  }

  async getCurrentUser(userId: string): Promise<AuthUserPublic> {
    const user = await this.authRepository.findById(userId);

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    if (user.statut === 'SUSPENDU' || user.statut === 'INACTIF') {
      throw new UnauthorizedError('Account is not active');
    }

    return {
      id: user.id,
      telephone: user.telephone,
      role: user.role,
      statut: user.statut,
      telephoneVerificationStatus: user.telephoneVerificationStatus,
    };
  }
}
