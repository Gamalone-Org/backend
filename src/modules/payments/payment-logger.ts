import { pino } from 'pino';
import { env } from '../../config/env.js';

export const paymentLogger = pino({
  name: 'payments',
  level: env.NODE_ENV === 'test' ? 'silent' : 'info',
});

export function logPaymentError(event: string, meta: Record<string, unknown> = {}): void {
  paymentLogger.error({ event, ...meta });
}
