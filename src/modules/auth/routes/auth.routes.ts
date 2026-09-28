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
