import { env } from './env.js';

/**
 * Redis configuration
 * Optional for caching and async operations
 */
export const redisConfig = {
  url: env.REDIS_URL,
  isEnabled: !!env.REDIS_URL,
};
