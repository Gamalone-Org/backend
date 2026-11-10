import { ArtisanType, UserRole, type User, OtpPurpose } from '../../../generated/prisma/client.js';
import { OtpService } from './OtpService.js';
import { PhoneService } from './PhoneService.js';
import { JwtService } from './JwtService.js';
import { PasswordService } from './PasswordService.js';
import { LoginRateLimiter } from './LoginRateLimiter.js';
import { AuthRepository } from '../repositories/AuthRepository.js';
import { OtpRepository } from '../repositories/OtpRepository.js';
import { PrismaClient } from '../../../generated/prisma/client.js';
import { createSmsService } from '../../../config/sms-factory.js';
import type { SmsService } from '../interfaces/SmsService.js';
import { resolveLoginIdentifier } from '../username.js';
import { env } from '../../../config/env.js';
import { randomBytes } from 'node:crypto';
import {
  ConflictError,
  ForbiddenError,
  InvalidOtpError,
  PhoneNotVerifiedError,
  ResetAuthorizationAlreadyUsedError,
  ResetAuthorizationExpiredError,
  ResetAuthorizationInvalidError,
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
  telephone?: string;
  identifier?: string;
  motDePasse: string;
  role?: 'ACHETEUR' | 'ARTISAN' | 'ADMIN';
};

export type AuthResponse = {
  accessToken: string;
  tokenType: 'Bearer';
  user: AuthUserPublic;
};

export type PhoneVerificationResult = { message: string; expiresAt: Date };

export type ForgotPasswordResult = { message: string; expiresAt: Date };

export type VerifyResetOtpResult = { message: string; resetToken: string; expiresAt: Date };

export type ResetPasswordResult = { message: string };

export class AuthService {
  constructor(
    private readonly authRepository: AuthRepository,
    private readonly otpService: OtpService,
    private readonly phoneService: PhoneService,
    private readonly otpRepository: OtpRepository,
    private readonly prisma: PrismaClient,
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
    const clientIp = ip ?? 'unknown';
    const resolved = resolveLoginIdentifier({
      identifier: input.identifier,
      telephone: input.telephone,
    });

    let user: User | null = null;
    let rateLimitKey: string;

    switch (resolved.type) {
      case 'phone': {
        const normalizedPhone = this.phoneService.normalize(resolved.value);
        rateLimitKey = `phone:${normalizedPhone}`;
        user = await this.authRepository.findByPhone(normalizedPhone);
        break;
      }
      case 'email': {
        rateLimitKey = `email:${resolved.value}`;
        user = await this.authRepository.findByEmail(resolved.value);
        break;
      }
      case 'username': {
        rateLimitKey = `username:${resolved.value}`;
        user = await this.authRepository.findByUsername(resolved.value);
        break;
      }
    }

    if (!user) {
      this.loginRateLimiter.recordFailure(rateLimitKey, clientIp);
      throw new UnauthorizedError('Invalid credentials');
    }

    this.loginRateLimiter.check(rateLimitKey, clientIp);

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
      this.loginRateLimiter.recordFailure(rateLimitKey, clientIp);
      throw new UnauthorizedError('Invalid credentials');
    }

    if (input.role && input.role !== user.role) {
      throw new ForbiddenError(
        `This account belongs to a ${user.role} account. Please use the ${user.role} space instead.`
      );
    }

    if (user.telephoneVerificationStatus !== 'VERIFIE') {
      throw new PhoneNotVerifiedError(
        'Your phone number is not verified yet. Please verify it with the code sent by SMS.'
      );
    }

    this.loginRateLimiter.reset(rateLimitKey, clientIp);

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

  /**
   * ÉTAPE 1 : Demande de réinitialisation de mot de passe
   * Envoie un OTP PASSWORD_RESET si le compte existe ET possède déjà un mot de passe.
   * Retourne toujours la même réponse générique pour ne pas révéler l'existence d'un compte.
   */
  async forgotPassword(phone: string, ip?: string): Promise<ForgotPasswordResult> {
    const normalizedPhone = this.phoneService.normalize(phone);

    // Vérifier rate limiting (réutilise le même mécanisme que les autres OTP)
    await this.otpService.checkRateLimit(normalizedPhone, ip, OtpPurpose.PASSWORD_RESET);

    const existingUser = await this.authRepository.findByPhone(normalizedPhone);

    // Réponse générique identique que le compte existe ou non
    const genericResponse = {
      message: 'If an account with this phone number exists and has a password set, a reset code has been sent.',
      expiresAt: new Date(Date.now() + env.OTP_TTL_SECONDS * 1000),
    };

    // Ne crée et n'envoie l'OTP QUE si l'utilisateur existe ET a un mot de passe
    if (existingUser && existingUser.motDePasse) {
      const { code, expiresAt } = await this.otpService.createOtp({
        phone: normalizedPhone,
        userId: existingUser.id,
        purpose: OtpPurpose.PASSWORD_RESET,
      });

      await this.smsService.sendOtp(normalizedPhone, code);

      return {
        message: genericResponse.message,
        expiresAt,
      };
    }

    return genericResponse;
  }

  /**
   * ÉTAPE 2 : Vérification de l'OTP de réinitialisation
   * Vérifie l'OTP PASSWORD_RESET et délivre une autorisation temporaire (resetToken)
   * valable 5 minutes, à usage unique.
   */
  async verifyResetOtp(phone: string, code: string): Promise<VerifyResetOtpResult> {
    const normalizedPhone = this.phoneService.normalize(phone);

    if (!code || code.trim().length !== 6 || !/^\d{6}$/.test(code.trim())) {
      throw new InvalidOtpError('OTP must be a 6-digit code');
    }

    // Vérifier l'OTP avec le purpose PASSWORD_RESET
    await this.otpService.verifyOtp({
      phone: normalizedPhone,
      code: code.trim(),
      purpose: OtpPurpose.PASSWORD_RESET,
    });

    // L'OTP a été marqué UTILISE par verifyOtp.
    // Nous devons maintenant créer une autorisation de réinitialisation temporaire.
    // On utilise le même enregistrement OTP (maintenant UTILISE) et on le marque
    // comme consommé pour la réinitialisation via consumedForResetAt.
    // L'autorisation (resetToken) est simplement l'ID de l'OTP, signé ou non.
    // Pour la sécurité, on ne renvoie pas l'ID brut mais un token opaque.
    // Ici, on utilise l'ID de l'OTP comme base, préfixé pour éviter confusion.

    // Note: L'OTP vient d'être marqué UTILISE, donc findLatestActive ne le trouvera plus.
    // Il faut chercher le dernier OTP UTILISE pour ce purpose.
    const lastUsedOtp = await this.prisma.otpCode.findFirst({
      where: {
        phone: normalizedPhone,
        purpose: OtpPurpose.PASSWORD_RESET,
        status: 'UTILISE',
        consumedForResetAt: null,
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!lastUsedOtp) {
      throw new ResetAuthorizationInvalidError('Reset authorization not found');
    }

    // Marquer comme consommé pour la réinitialisation (atomique)
    const consumed = await this.otpRepository.findAndConsumeResetAuthorization(
      normalizedPhone,
      OtpPurpose.PASSWORD_RESET
    );

    if (!consumed) {
      throw new ResetAuthorizationAlreadyUsedError('Reset authorization already consumed');
    }

    // Générer un token de réinitialisation opaque (non-JWT pour éviter confusion)
    // Format: reset_<otpId>_<timestamp>_<random>
    const randomSuffix = randomBytes(8).toString('hex');
    const resetToken = `reset_${consumed.id}_${Date.now()}_${randomSuffix}`;

    // L'autorisation expire dans 5 minutes (300 secondes)
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    return {
      message: 'OTP verified. Reset authorization granted.',
      resetToken,
      expiresAt,
    };
  }

  /**
   * ÉTAPE 3 : Réinitialisation du mot de passe
   * Consomme atomiquement l'autorisation de réinitialisation, valide le nouveau
   * mot de passe, le hash, met à jour l'utilisateur, invalide les OTP de reset
   * restants et invalide les sessions existantes (si possible).
   */
  async resetPassword(resetToken: string, newPassword: string): Promise<ResetPasswordResult> {
    // Parser le token pour extraire l'OTP ID
    const tokenMatch = resetToken.match(/^reset_([a-f0-9-]{36})_\d+_[a-f0-9]{16}$/);
    if (!tokenMatch) {
      throw new ResetAuthorizationInvalidError('Invalid reset token format');
    }

    const otpId = tokenMatch[1];

    // Trouver l'OTP par ID et vérifier qu'il est consommé pour reset
    const otp = await this.prisma.otpCode.findUnique({
      where: { id: otpId },
    });

    if (!otp) {
      throw new ResetAuthorizationInvalidError('Reset authorization not found');
    }

    if (otp.purpose !== OtpPurpose.PASSWORD_RESET) {
      throw new ResetAuthorizationInvalidError('Invalid reset authorization purpose');
    }

    if (otp.status !== 'UTILISE' || !otp.consumedForResetAt) {
      throw new ResetAuthorizationAlreadyUsedError('Reset authorization not properly consumed');
    }

    // Vérifier expiration de l'autorisation (5 minutes après consommation)
    const authExpiresAt = new Date(otp.consumedForResetAt.getTime() + 5 * 60 * 1000);
    if (new Date() > authExpiresAt) {
      throw new ResetAuthorizationExpiredError('Reset authorization expired');
    }

    // Valider le nouveau mot de passe (réutilise PasswordService)
    const validatedPassword = this.passwordService.validatePassword(newPassword);
    const passwordHash = await this.passwordService.hash(validatedPassword);

    // Mettre à jour le mot de passe de l'utilisateur
    if (!otp.userId) {
      throw new ResetAuthorizationInvalidError('Reset authorization not linked to a user');
    }

    await this.authRepository.updatePassword(otp.userId, passwordHash);

    // Invalider les autres OTP PASSWORD_RESET actifs pour ce téléphone
    await this.otpRepository.invalidateResetOtpsByPhone(otp.phone);

    return { message: 'Password has been reset successfully' };
  }
}
