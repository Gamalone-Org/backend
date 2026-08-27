import type { AdminAccessLevel } from '../generated/prisma/client.js';
import { env } from './env.js';

const MIN_SIGNED_URL_TTL = 60;
const MAX_SIGNED_URL_TTL = 3600;
const MIN_RETENTION_DAYS = 30;
const MAX_RETENTION_DAYS = 3650;

function validateSignedUrlTtl(ttl: number): number {
  if (!Number.isInteger(ttl) || ttl < MIN_SIGNED_URL_TTL || ttl > MAX_SIGNED_URL_TTL) {
    throw new Error(
      `KYC_SIGNED_URL_TTL must be an integer between ${MIN_SIGNED_URL_TTL} and ${MAX_SIGNED_URL_TTL} seconds, got ${ttl}`
    );
  }
  return ttl;
}

function validateRetentionDays(days: number): number {
  if (!Number.isInteger(days) || days < MIN_RETENTION_DAYS || days > MAX_RETENTION_DAYS) {
    throw new Error(
      `KYC_RETENTION_DAYS must be an integer between ${MIN_RETENTION_DAYS} and ${MAX_RETENTION_DAYS} days, got ${days}`
    );
  }
  return days;
}

export const kycConfig = {
  retentionDays: validateRetentionDays(env.KYC_RETENTION_DAYS),
  signedUrlTtlSeconds: validateSignedUrlTtl(env.KYC_SIGNED_URL_TTL),
} as const;

export function computeRetentionUntil(baseDate: Date = new Date()): Date {
  const retentionUntil = new Date(baseDate);
  retentionUntil.setUTCDate(retentionUntil.getUTCDate() + kycConfig.retentionDays);
  return retentionUntil;
}

const ADMIN_LEVEL_RANK: Record<AdminAccessLevel, number> = {
  SUPPORT: 0,
  MODERATEUR: 1,
  SUPER_ADMIN: 2,
};

export function hasMinAdminAccessLevel(
  current: AdminAccessLevel | null | undefined,
  minimum: AdminAccessLevel
): boolean {
  if (!current) {
    return false;
  }
  return ADMIN_LEVEL_RANK[current] >= ADMIN_LEVEL_RANK[minimum];
}

export const ANONYMIZED_JSON_MARKER = { anonymized: true } as const;
