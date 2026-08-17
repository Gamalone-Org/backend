import { z } from 'zod';

// Define the environment schema
const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  DATABASE_URL: z.string().url('Invalid DATABASE_URL'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters').optional(),
  REDIS_URL: z.string().url('Invalid REDIS_URL').optional(),
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),
});

type EnvType = z.infer<typeof EnvSchema>;

// Parse and validate environment variables
function parseEnv(): EnvType {
  const env = {
    NODE_ENV: process.env['NODE_ENV'],
    PORT: process.env['PORT'],
    DATABASE_URL: process.env['DATABASE_URL'],
    JWT_SECRET: process.env['JWT_SECRET'],
    REDIS_URL: process.env['REDIS_URL'],
    CLOUDINARY_CLOUD_NAME: process.env['CLOUDINARY_CLOUD_NAME'],
    CLOUDINARY_API_KEY: process.env['CLOUDINARY_API_KEY'],
    CLOUDINARY_API_SECRET: process.env['CLOUDINARY_API_SECRET'],
  };

  const result = EnvSchema.safeParse(env);

  if (!result.success) {
    console.error('Invalid environment variables:', result.error.flatten());
    process.exit(1);
  }

  return result.data;
}

export const env = parseEnv();
