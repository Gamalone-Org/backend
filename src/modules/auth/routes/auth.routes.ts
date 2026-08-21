import { Router } from 'express';
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

const router = Router();
const authRepository = new AuthRepository(prisma);
const otpRepository = new OtpRepository(prisma);
const phoneService = new PhoneService();
const otpService = new OtpService(otpRepository, phoneService);
const jwtService = new JwtService();
const authService = new AuthService(authRepository, otpService, phoneService, createSmsService(), jwtService);

const otpSendSchema = z.object({
  phone: z.string().min(1, 'Phone number is required'),
});

const otpVerifySchema = z.object({
  phone: z.string().min(1, 'Phone number is required'),
  code: z.string().min(1, 'OTP is required'),
});

const otpResendSchema = z.object({
  phone: z.string().min(1, 'Phone number is required'),
});

router.post('/otp/send', async (req, res, next) => {
  try {
    const parsed = otpSendSchema.parse(req.body);
    const forwardedFor = Array.isArray(req.headers['x-forwarded-for'])
      ? req.headers['x-forwarded-for'][0]
      : req.headers['x-forwarded-for'];
    const clientIp = req.ip ?? forwardedFor ?? 'unknown';
    const result = await authService.requestOtp(parsed.phone, clientIp);
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
    const result = await authService.resendOtp(parsed.phone, clientIp);
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
    const result = await authService.verifyOtp(parsed.phone, parsed.code);
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

export default router;
