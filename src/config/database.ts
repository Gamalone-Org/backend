import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { env } from './env.js';

/**
 * Database configuration
 * Uses Prisma as ORM with PostgreSQL
 */
export const databaseConfig = {
  url: env.DATABASE_URL,
  isDevelopment: env.NODE_ENV === 'development',
};

export const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
});
