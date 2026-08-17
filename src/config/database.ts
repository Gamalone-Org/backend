import { env } from './env.js';

/**
 * Database configuration
 * Uses Prisma as ORM with PostgreSQL
 */
export const databaseConfig = {
  url: env.DATABASE_URL,
  isDevelopment: env.NODE_ENV === 'development',
};
