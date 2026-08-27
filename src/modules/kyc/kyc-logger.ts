import { pino } from 'pino';
import { env } from '../../config/env.js';

type KycLogMeta = {
  kycId?: string;
  documentId?: string;
  userId?: string;
  adminProfileId?: string;
  errorCode?: string;
  documentCount?: number;
  scanned?: number;
  anonymized?: number;
  skipped?: number;
  failed?: number;
};

export const kycLogger = pino({
  name: 'kyc',
  level: env.NODE_ENV === 'test' ? 'silent' : 'info',
});

export function logKycInfo(event: string, meta: KycLogMeta = {}): void {
  kycLogger.info({ event, ...meta });
}

export function logKycWarn(event: string, meta: KycLogMeta = {}): void {
  kycLogger.warn({ event, ...meta });
}

export function logKycError(event: string, meta: KycLogMeta = {}): void {
  kycLogger.error({ event, ...meta });
}
