import { Router } from 'express';
import type { Request } from 'express';
import { z } from 'zod';
import { prisma } from '../../../config/database.js';
import { AppError, ValidationError } from '../../../common/errors/AppError.js';
import { AuthRepository } from '../repositories/AuthRepository.js';
import { AuthService } from '../services/AuthService.js';
import { JwtService } from '../services/JwtService.js';
import { OtpService } from '../services/OtpService.js';
import { PhoneService } from '../services/PhoneService.js';
import { OtpRepository } from '../repositories/OtpRepository.js';
import { createSmsService } from '../../../config/sms-factory.js';
import { requireAuth } from '../middleware/auth.middleware.js';
import { loginSchema, registerSchema, verifyPhoneSchema } from '../schema.js';
import { otpPhoneFields } from '../services/PhoneService.js';
import { ResetAuthorizationExpiredError, ResetAuthorizationAlreadyUsedError, ResetAuthorizationInvalidError } from '../../../common/errors/AppError.js';

const router = Router();
const authRepository = new AuthRepository(prisma);
const otpRepository = new OtpRepository(prisma);
const phoneService = new PhoneService();
const otpService = new OtpService(otpRepository, phoneService);
const jwtService = new JwtService();
const authService = new AuthService(
  authRepository,
  otpService,
  phoneService,
  otpRepository,
  prisma,
  createSmsService(),
  jwtService
);

// `countryCode` est optionnel : s'il est fourni, `phone` est le numero national
// (`{ countryCode: '+33', phone: '612345678' }`). S'il est absent, `phone` reste
// le numero international complet : le contrat historique est inchange.
const otpSendSchema = z.object({
  ...otpPhoneFields,
});

const otpVerifySchema = z.object({
  ...otpPhoneFields,
  code: z.string().min(1, 'OTP is required'),
});

const otpResendSchema = z.object({
  ...otpPhoneFields,
});

/**
 * Compose `countryCode` + `phone` en un E.164 normalise.
 * Leve `InvalidPhoneError` (-> 400) si l'indicatif ou le numero est invalide.
 * La composition se fait ici, dans la couche route, pour que les signatures de
 * `AuthService` / `OtpService` restent inchangees.
 */
function resolveRequestPhone(countryCode: string | undefined, value: string): string {
  return phoneService.resolveFromRequest({ countryCode, phone: value });
}

router.post('/otp/send', async (req, res, next) => {
  try {
    const parsed = otpSendSchema.parse(req.body);
    const forwardedFor = Array.isArray(req.headers['x-forwarded-for'])
      ? req.headers['x-forwarded-for'][0]
      : req.headers['x-forwarded-for'];
    const clientIp = req.ip ?? forwardedFor ?? 'unknown';
    const result = await authService.requestOtp(
      resolveRequestPhone(parsed.countryCode, parsed.phone),
      clientIp
    );
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }

    if (error instanceof z.ZodError) {
      next(new ValidationError(error.issues[0]?.message ?? 'Invalid request'));
      return;
    }

    next(error);
  }
});

router.post('/otp/resend', async (req, res, next) => {
  try {
    const parsed = otpResendSchema.parse(req.body);
    const forwardedFor = Array.isArray(req.headers['x-forwarded-for'])
      ? req.headers['x-forwarded-for'][0]
      : req.headers['x-forwarded-for'];
    const clientIp = req.ip ?? forwardedFor ?? 'unknown';
    const result = await authService.resendOtp(
      resolveRequestPhone(parsed.countryCode, parsed.phone),
      clientIp
    );
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }

    if (error instanceof z.ZodError) {
      next(new ValidationError(error.issues[0]?.message ?? 'Invalid request'));
      return;
    }

    next(error);
  }
});

router.post('/otp/verify', async (req, res, next) => {
  try {
    const parsed = otpVerifySchema.parse(req.body);
    const result = await authService.verifyOtp(
      resolveRequestPhone(parsed.countryCode, parsed.phone),
      parsed.code
    );
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }

    if (error instanceof z.ZodError) {
      next(new ValidationError(error.issues[0]?.message ?? 'Invalid request'));
      return;
    }

    next(error);
  }
});

router.post('/register', async (req, res, next) => {
  try {
    const { countryCode, ...parsed } = registerSchema.parse(req.body);
    const clientIp = resolveClientIp(req);
    const result = await authService.register(
      { ...parsed, telephone: resolveRequestPhone(countryCode, parsed.telephone) },
      clientIp
    );
    res.status(201).json({ success: true, ...result });
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }

    if (error instanceof z.ZodError) {
      next(new ValidationError(error.issues[0]?.message ?? 'Invalid request'));
      return;
    }

    next(error);
  }
});

router.post('/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.parse(req.body);
    const clientIp = resolveClientIp(req);
    const result = await authService.login(resolveLoginPayload(parsed), clientIp);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }

    if (error instanceof z.ZodError) {
      next(new ValidationError(error.issues[0]?.message ?? 'Invalid request'));
      return;
    }

    next(error);
  }
});

router.post('/verify-phone', async (req, res, next) => {
  try {
    const { countryCode, ...parsed } = verifyPhoneSchema.parse(req.body);
    const result = await authService.verifyPhone(
      resolveRequestPhone(countryCode, parsed.telephone),
      parsed.code
    );
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }

    if (error instanceof z.ZodError) {
      next(new ValidationError(error.issues[0]?.message ?? 'Invalid request'));
      return;
    }

    next(error);
  }
});

const forgotPasswordSchema = z.object({
  ...otpPhoneFields,
});

const verifyResetOtpSchema = z.object({
  ...otpPhoneFields,
  code: z.string().min(1, 'OTP is required'),
});

const resetPasswordSchema = z.object({
  resetToken: z.string().min(1, 'Reset token is required'),
  motDePasse: z.string().min(8, 'Password must be at least 8 characters').max(128),
});

/**
 * ÉTAPE 1 : Demande de réinitialisation de mot de passe
 * POST /api/v1/auth/forgot-password
 * Reçoit le numéro de téléphone, normalise, envoie OTP PASSWORD_RESET si compte existe avec mot de passe.
 * Retourne réponse générique identique pour ne pas révéler l'existence du compte.
 */
router.post('/forgot-password', async (req, res, next) => {
  try {
    const parsed = forgotPasswordSchema.parse(req.body);
    const forwardedFor = Array.isArray(req.headers['x-forwarded-for'])
      ? req.headers['x-forwarded-for'][0]
      : req.headers['x-forwarded-for'];
    const clientIp = req.ip ?? forwardedFor ?? 'unknown';
    const result = await authService.forgotPassword(
      resolveRequestPhone(parsed.countryCode, parsed.phone),
      clientIp
    );
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }

    if (error instanceof z.ZodError) {
      next(new ValidationError(error.issues[0]?.message ?? 'Invalid request'));
      return;
    }

    next(error);
  }
});

/**
 * ÉTAPE 2 : Vérification de l'OTP de réinitialisation
 * POST /api/v1/auth/verify-reset-otp
 * Reçoit téléphone + code OTP, vérifie OTP PASSWORD_RESET, délivre autorisation temporaire (resetToken) valable 5 min.
 */
router.post('/verify-reset-otp', async (req, res, next) => {
  try {
    const parsed = verifyResetOtpSchema.parse(req.body);
    const result = await authService.verifyResetOtp(
      resolveRequestPhone(parsed.countryCode, parsed.phone),
      parsed.code
    );
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    if (error instanceof AppError) {
      // Map specific reset authorization errors to appropriate HTTP status
      if (
        error instanceof ResetAuthorizationExpiredError ||
        error instanceof ResetAuthorizationAlreadyUsedError ||
        error instanceof ResetAuthorizationInvalidError
      ) {
        next(error);
        return;
      }
      next(error);
      return;
    }

    if (error instanceof z.ZodError) {
      next(new ValidationError(error.issues[0]?.message ?? 'Invalid request'));
      return;
    }

    next(error);
  }
});

/**
 * ÉTAPE 3 : Réinitialisation du mot de passe
 * POST /api/v1/auth/reset-password
 * Reçoit resetToken + nouveau mot de passe, consomme atomiquement l'autorisation, met à jour le mot de passe.
 */
router.post('/reset-password', async (req, res, next) => {
  try {
    const parsed = resetPasswordSchema.parse(req.body);
    const result = await authService.resetPassword(parsed.resetToken, parsed.motDePasse);
    res.status(200).json({ success: true, ...result });
  } catch (error) {
    if (error instanceof AppError) {
      if (
        error instanceof ResetAuthorizationExpiredError ||
        error instanceof ResetAuthorizationAlreadyUsedError ||
        error instanceof ResetAuthorizationInvalidError
      ) {
        next(error);
        return;
      }
      next(error);
      return;
    }

    if (error instanceof z.ZodError) {
      next(new ValidationError(error.issues[0]?.message ?? 'Invalid request'));
      return;
    }

    next(error);
  }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    if (!req.user) {
      throw new ValidationError('Authentication required');
    }

    const user = await authService.getCurrentUser(req.user.id);
    res.status(200).json({ success: true, user });
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
      return;
    }

    next(error);
  }
});

function resolveClientIp(req: Request): string {
  const forwardedFor = Array.isArray(req.headers['x-forwarded-for'])
    ? req.headers['x-forwarded-for'][0]
    : req.headers['x-forwarded-for'];
  return req.ip ?? forwardedFor ?? 'unknown';
}

/**
 * Normalise la charge utile de connexion.
 *
 * - `countryCode` fourni => `telephone` devient l'E.164 compose, et `identifier`
 *   est retire pour que `resolveLoginIdentifier()` ne puisse pas reinterpreter
 *   le numero (le schema garantit deja leur absence conjointe).
 * - `countryCode` absent  => payload transmis tel quel, comportement inchange
 *   (email, username, ou telephone international via `identifier`/`telephone`).
 */
function resolveLoginPayload(parsed: z.infer<typeof loginSchema>): {
  telephone?: string;
  identifier?: string;
  motDePasse: string;
  role?: 'ACHETEUR' | 'ARTISAN' | 'ADMIN';
} {
  const { countryCode, telephone, identifier, ...others } = parsed;

  if (countryCode === undefined) {
    return { ...others, telephone, identifier };
  }

  return {
    ...others,
    telephone: resolveRequestPhone(countryCode, telephone ?? ''),
  };
}

export default router;
