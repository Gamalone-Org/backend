import { env } from './env.js';

export const otpConfig = {
  ttlSeconds: env.OTP_TTL_SECONDS,
  maxAttempts: env.OTP_MAX_ATTEMPTS,
  cooldownSeconds: env.OTP_COOLDOWN_SECONDS,
  resendCooldownSeconds: env.OTP_RESEND_COOLDOWN_SECONDS,
  rateLimitPerPhone: env.OTP_RATE_LIMIT_PER_PHONE,
  rateLimitPerIp: env.OTP_RATE_LIMIT_PER_IP,
} as const;

export const smsConfig = {
  provider: env.SMS_PROVIDER,
  from: env.SMS_FROM,
  apiKey: env.SMS_API_KEY,
  apiSecret: env.SMS_API_SECRET,
  senderId: env.SMS_SENDER_ID,
  accountSid: env.SMS_ACCOUNT_SID,
  authToken: env.SMS_AUTH_TOKEN,
  baseUrl: env.SMS_BASE_URL,
  timeoutMs: env.SMS_TIMEOUT_MS,
} as const;
