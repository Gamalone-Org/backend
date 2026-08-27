import { z } from 'zod';

const defaultDatabaseUrl = 'postgresql://postgres:postgres@localhost:5432/gamalone_backend';
const defaultDevJwtSecret = '12345678901234567890123456789012';

const smsProviderSchema = z.enum(['mock', 'twilio', 'messagebird', 'afriksms', 'custom']).default('mock');
const defaultCorsOrigins = 'http://localhost:5000,http://localhost:3000,http://localhost:5173,http://localhost:4173';
const corsOriginsSchema = z
  .string()
  .default(defaultCorsOrigins)
  .transform((value) =>
    value
      .split(',')
      .map((origin) => origin.trim())
      .filter(Boolean)
  );

const databaseUrlSchema =
  process.env['NODE_ENV'] === 'production'
    ? z.string().url('Invalid DATABASE_URL')
    : z.string().url('Invalid DATABASE_URL').default(defaultDatabaseUrl);

const EnvSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().default(5000),
    API_PUBLIC_URL: z.string().url('Invalid API_PUBLIC_URL').default('http://localhost:5000'),
    DATABASE_URL: databaseUrlSchema,
    JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
    JWT_EXPIRES_IN: z.string().min(1, 'JWT_EXPIRES_IN is required').default('7d'),
    REDIS_URL: z.string().url('Invalid REDIS_URL').optional(),
    CLOUDINARY_CLOUD_NAME: z.string().optional(),
    CLOUDINARY_API_KEY: z.string().optional(),
    CLOUDINARY_API_SECRET: z.string().optional(),
    KYC_RETENTION_DAYS: z.coerce.number().int().positive().max(3650).default(365),
    KYC_SIGNED_URL_TTL: z.coerce.number().int().positive().max(3600).default(900),
    CORS_ORIGINS: corsOriginsSchema,
    SMS_PROVIDER: smsProviderSchema,
    SMS_CLIENT_ID: z.string().optional(),
    SMS_FROM: z.string().optional(),
    SMS_API_KEY: z.string().optional(),
    SMS_API_SECRET: z.string().optional(),
    SMS_SENDER_ID: z.string().optional(),
    SMS_ACCOUNT_SID: z.string().optional(),
    SMS_AUTH_TOKEN: z.string().optional(),
    SMS_BASE_URL: z.string().url('Invalid SMS_BASE_URL').optional(),
    SMS_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),
    OTP_TTL_SECONDS: z.coerce.number().int().positive().default(300),
    OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),
    OTP_COOLDOWN_SECONDS: z.coerce.number().int().nonnegative().default(60),
    OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().nonnegative().default(30),
    OTP_RATE_LIMIT_PER_PHONE: z.coerce.number().int().positive().default(5),
    OTP_RATE_LIMIT_PER_IP: z.coerce.number().int().positive().default(20),
  })
  .superRefine((data, ctx) => {
    if (data.NODE_ENV !== 'production') {
      return;
    }

    if (!process.env['JWT_SECRET']) {
      ctx.addIssue({
        code: 'custom',
        path: ['JWT_SECRET'],
        message: 'JWT_SECRET is required in production',
      });
    }

    if (!process.env['DATABASE_URL']) {
      ctx.addIssue({
        code: 'custom',
        path: ['DATABASE_URL'],
        message: 'DATABASE_URL is required in production',
      });
    }

    if (!process.env['API_PUBLIC_URL']) {
      ctx.addIssue({
        code: 'custom',
        path: ['API_PUBLIC_URL'],
        message: 'API_PUBLIC_URL is required in production',
      });
    }

    if (!data.CLOUDINARY_CLOUD_NAME || !data.CLOUDINARY_API_KEY || !data.CLOUDINARY_API_SECRET) {
      ctx.addIssue({
        code: 'custom',
        path: ['CLOUDINARY_CLOUD_NAME'],
        message: 'Cloudinary configuration (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET) is required in production',
      });
    }

    if (!process.env['KYC_RETENTION_DAYS']) {
      ctx.addIssue({
        code: 'custom',
        path: ['KYC_RETENTION_DAYS'],
        message: 'KYC_RETENTION_DAYS is required in production',
      });
    }

    if (!process.env['KYC_SIGNED_URL_TTL']) {
      ctx.addIssue({
        code: 'custom',
        path: ['KYC_SIGNED_URL_TTL'],
        message: 'KYC_SIGNED_URL_TTL is required in production',
      });
    }

    if (data.KYC_SIGNED_URL_TTL < 60 || data.KYC_SIGNED_URL_TTL > 3600) {
      ctx.addIssue({
        code: 'custom',
        path: ['KYC_SIGNED_URL_TTL'],
        message: 'KYC_SIGNED_URL_TTL must be between 60 and 3600 seconds in production',
      });
    }

    if (data.KYC_RETENTION_DAYS < 30 || data.KYC_RETENTION_DAYS > 3650) {
      ctx.addIssue({
        code: 'custom',
        path: ['KYC_RETENTION_DAYS'],
        message: 'KYC_RETENTION_DAYS must be between 30 and 3650 days in production',
      });
    }

    if (!process.env['SMS_PROVIDER']) {
      ctx.addIssue({
        code: 'custom',
        path: ['SMS_PROVIDER'],
        message: 'SMS_PROVIDER is required in production',
      });
    }
  });

type EnvType = z.infer<typeof EnvSchema>;

function parseEnv(): EnvType {
  const nodeEnv = process.env['NODE_ENV'];
  const env = {
    NODE_ENV: nodeEnv,
    PORT: process.env['PORT'],
    API_PUBLIC_URL: process.env['API_PUBLIC_URL'] ?? 'http://localhost:5000',
    DATABASE_URL: process.env['DATABASE_URL'] ?? defaultDatabaseUrl,
    JWT_SECRET:
      process.env['JWT_SECRET'] ??
      (nodeEnv === 'production' ? undefined : defaultDevJwtSecret),
    JWT_EXPIRES_IN: process.env['JWT_EXPIRES_IN'] ?? '7d',
    REDIS_URL: process.env['REDIS_URL'],
    CLOUDINARY_CLOUD_NAME: process.env['CLOUDINARY_CLOUD_NAME'],
    CLOUDINARY_API_KEY: process.env['CLOUDINARY_API_KEY'],
    CLOUDINARY_API_SECRET: process.env['CLOUDINARY_API_SECRET'],
    KYC_RETENTION_DAYS: process.env['KYC_RETENTION_DAYS'],
    KYC_SIGNED_URL_TTL: process.env['KYC_SIGNED_URL_TTL'],
    CORS_ORIGINS: process.env['CORS_ORIGINS'] ?? defaultCorsOrigins,
    SMS_PROVIDER: process.env['SMS_PROVIDER'],
    SMS_CLIENT_ID: process.env['SMS_CLIENT_ID'],
    SMS_FROM: process.env['SMS_FROM'],
    SMS_API_KEY: process.env['SMS_API_KEY'],
    SMS_API_SECRET: process.env['SMS_API_SECRET'],
    SMS_SENDER_ID: process.env['SMS_SENDER_ID'],
    SMS_ACCOUNT_SID: process.env['SMS_ACCOUNT_SID'],
    SMS_AUTH_TOKEN: process.env['SMS_AUTH_TOKEN'],
    SMS_BASE_URL: process.env['SMS_BASE_URL'],
    SMS_TIMEOUT_MS: process.env['SMS_TIMEOUT_MS'],
    OTP_TTL_SECONDS: process.env['OTP_TTL_SECONDS'],
    OTP_MAX_ATTEMPTS: process.env['OTP_MAX_ATTEMPTS'],
    OTP_COOLDOWN_SECONDS: process.env['OTP_COOLDOWN_SECONDS'],
    OTP_RESEND_COOLDOWN_SECONDS: process.env['OTP_RESEND_COOLDOWN_SECONDS'],
    OTP_RATE_LIMIT_PER_PHONE: process.env['OTP_RATE_LIMIT_PER_PHONE'],
    OTP_RATE_LIMIT_PER_IP: process.env['OTP_RATE_LIMIT_PER_IP'],
  };

  const result = EnvSchema.safeParse(env);

  if (!result.success) {
    console.error('Invalid environment variables:', result.error.flatten());
    process.exit(1);
  }

  return result.data;
}

export const env = parseEnv();
