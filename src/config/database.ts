// import { PrismaPg } from '@prisma/adapter-pg';
// import { PrismaClient } from '../generated/prisma/client.js';
// import { env } from './env.js';

// /**
//  * Database configuration
//  * Uses Prisma as ORM with PostgreSQL
//  */
// export const databaseConfig = {
//   url: env.DATABASE_URL,
//   isDevelopment: env.NODE_ENV === 'development',
// };

// /**
//  * Singleton PrismaClient for PostgreSQL.
//  *
//  * Serverless note: connection pooling is delegated to `@prisma/adapter-pg`
//  * (pg.Pool is lazy, connections are opened on first query, never closed per
//  * request). In local development, hot reload and test runners would otherwise
//  * create one PrismaClient + pool per module evaluation; the global cache below
//  * deduplicates them to avoid exhausting connections. In production each
//  * serverless instance keeps a single client for the instance lifetime.
//  */
// const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// export const prisma =
//   globalForPrisma.prisma ??
//   new PrismaClient({
//     adapter: new PrismaPg({ connectionString: env.DATABASE_URL }),
//   });

// if (env.NODE_ENV !== 'production') {
//   globalForPrisma.prisma = prisma;
// }

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { env } from './env.js';

/**
 * Database configuration
 */
export const databaseConfig = {
  url: env.DATABASE_URL,
  isDevelopment: env.NODE_ENV === 'development',
};

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const adapter = new PrismaPg({
  connectionString: env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
  });

if (env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
