import { ArtisanType, UserRole, type User, OtpPurpose } from '../../../generated/prisma/client.js';
import { OtpService } from './OtpService.js';
import { PhoneService } from './PhoneService.js';
import { JwtService } from './JwtService.js';
import { PasswordService } from './PasswordService.js';
import { LoginRateLimiter } from './LoginRateLimiter.js';
import { AuthRepository } from '../repositories/AuthRepository.js';
import { createSmsService } from '../../../config/sms-factory.js';
import type { SmsService } from '../interfaces/SmsService.js';
import {
  ConflictError,
  ForbiddenError,
  InvalidOtpError,
  PhoneNotVerifiedError,
  UnauthorizedError,
  ValidationError,
} from '../../../common/errors/AppError.js';

export type AuthUserPublic = {
  id: string;
  telephone: string;
  nom: string | null;
  role: UserRole;
  statut: User['statut'];
  telephoneVerificationStatus: User['telephoneVerificationStatus'];
};

export type RegisterInput = {
  role: 'ACHETEUR' | 'ARTISAN';
  nom: string;
  telephone: string;
  email?: string;
  motDePasse: string;
  type?: ArtisanType;
  specialite?: string;
  localisation?: string;
};

export type LoginInput = {
  telephone: string;
  motDePasse: string;
  role?: 'ACHETEUR' | 'ARTISAN';
};

export type AuthResponse = {
  accessToken: string;
  tokenType: 'Bearer';
  user: AuthUserPublic;
};

export type PhoneVerificationResult = { message: string; expiresAt: Date };

export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly otpService: OtpService,
    private readonly phoneService: PhoneService,
    private readonly smsService: SmsService = createSmsService(),
    private readonly jwtService: JwtService = new JwtService(),
    private readonly passwordService: PasswordService = new PasswordService(),
    private readonly loginRateLimiter: LoginRateLimiter = new LoginRateLimiter()
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

  async verifyOtp(phone: string, code: string): Promise<AuthResponse> {
    const { user } = await this.verifyPhoneInternal(phone, code, { autoCreate: true });
    return this.buildAuthResponse(user);
  }

  async verifyPhone(phone: string, code: string): Promise<AuthResponse> {
    const { user } = await this.verifyPhoneInternal(phone, code, { autoCreate: false });
    return this.buildAuthResponse(user);
  }

  async register(input: RegisterInput, ip?: string): Promise<PhoneVerificationResult> {
    if (input.role !== 'ACHETEUR' && input.role !== 'ARTISAN') {
      throw new ValidationError('Role must be ACHETEUR or ARTISAN');
    }

    const normalizedPhone = this.phoneService.normalize(input.telephone);
    const email = input.email ? input.email.trim().toLowerCase() : null;
    const nom = input.nom.trim();

    const existingByPhone = await this.authRepository.findByPhone(normalizedPhone);
    if (existingByPhone) {
      throw new ConflictError('An account with this phone number already exists');
    }

    if (email) {
      const existingByEmail = await this.authRepository.findByEmail(email);
      if (existingByEmail) {
        throw new ConflictError('An account with this email already exists');
      }
    }

    const passwordHash = await this.passwordService.hash(input.motDePasse);

    try {
      await this.authRepository.createUserWithCredentials({
        telephone: normalizedPhone,
        email,
        nom,
        motDePasseHash: passwordHash,
        role: input.role,
        artisanProfile:
          input.role === 'ARTISAN'
            ? {
                type: input.type ?? ArtisanType.ARTISAN,
                nomAtelier: nom,
                specialite: input.specialite ?? '',
                localisation: input.localisation ?? '',
                biographie: '',
                anneesExperience: 0,
              }
            : null,
        buyerProfile:
          input.role === 'ACHETEUR'
            ? {
                adresseLivraison: '',
              }
            : null,
      });
    } catch (error) {
      if (this.authRepository.isUniqueConstraintError(error)) {
        throw new ConflictError('An account with this phone number or email already exists');
      }
      throw error;
    }

    const { expiresAt } = await this.requestOtp(normalizedPhone, ip);

    return {
      message: 'Account created. A verification code has been sent by SMS.',
      expiresAt,
    };
  }

  async login(input: LoginInput, ip?: string): Promise<AuthResponse> {
    const normalizedPhone = this.phoneService.normalize(input.telephone);
    const clientIp = ip ?? 'unknown';

    const user = await this.authRepository.findByPhone(normalizedPhone);

    if (!user) {
      this.loginRateLimiter.recordFailure(normalizedPhone, clientIp);
      throw new UnauthorizedError('Invalid credentials');
    }

    this.loginRateLimiter.check(normalizedPhone, clientIp);

    if (user.statut === 'SUSPENDU' || user.statut === 'INACTIF') {
      throw new ForbiddenError('Account is not active');
    }

    if (!user.motDePasse) {
      throw new UnauthorizedError(
        'Password authentication is not enabled for this account. Use phone OTP verification instead.'
      );
    }

    const isValidPassword = await this.passwordService.compare(input.motDePasse, user.motDePasse);

    if (!isValidPassword) {
      this.loginRateLimiter.recordFailure(normalizedPhone, clientIp);
      throw new UnauthorizedError('Invalid credentials');
    }

    if (input.role && input.role !== user.role) {
      throw new ForbiddenError(
        `This phone number belongs to a ${user.role} account. Please use the ${user.role} space instead.`
      );
    }

    if (user.telephoneVerificationStatus !== 'VERIFIE') {
      throw new PhoneNotVerifiedError(
        'Your phone number is not verified yet. Please verify it with the code sent by SMS.'
      );
    }

    this.loginRateLimiter.reset(normalizedPhone, clientIp);

    return this.buildAuthResponse(user);
  }

  async getCurrentUser(userId: string): Promise<AuthUserPublic> {
    const user = await this.authRepository.findById(userId);

    if (!user) {
      throw new UnauthorizedError('User not found');
    }

    if (user.statut === 'SUSPENDU' || user.statut === 'INACTIF') {
      throw new UnauthorizedError('Account is not active');
    }

    return this.toPublicUser(user);
  }

  private async verifyPhoneInternal(
    phone: string,
    code: string,
    options: { autoCreate: boolean }
  ): Promise<{ user: User }> {
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
      if (!options.autoCreate) {
        throw new UnauthorizedError(
          'No account found for this phone number. Please register first.'
        );
      }
      user = await this.authRepository.createUser(normalizedPhone, 'ACHETEUR');
    }

    const updatedUser = await this.authRepository.updatePhoneVerification(
      user.id,
      'VERIFIE',
      new Date()
    );

    return { user: updatedUser };
  }

  private buildAuthResponse(user: User): AuthResponse {
    const accessToken = this.jwtService.generateToken({
      id: user.id,
      role: user.role,
    });

    return {
      accessToken,
      tokenType: 'Bearer',
      user: this.toPublicUser(user),
    };
  }

  private toPublicUser(user: User): AuthUserPublic {
    return {
      id: user.id,
      telephone: user.telephone,
      nom: user.nom,
      role: user.role,
      statut: user.statut,
      telephoneVerificationStatus: user.telephoneVerificationStatus,
    };
  }
}
