import { LoginRateLimitedError } from '../../../common/errors/AppError.js';

export interface LoginRateLimiterOptions {
  maxFailures?: number;
  windowMs?: number;
  lockoutMs?: number;
  maxKeys?: number;
}

const DEFAULT_MAX_FAILURES = 5;
const DEFAULT_WINDOW_MS = 15 * 60 * 1000;
const DEFAULT_LOCKOUT_MS = 15 * 60 * 1000;
const DEFAULT_MAX_KEYS = 10_000;

type AttemptEntry = {
  failures: number;
  windowStart: number;
  blockedUntil: number;
};

/**
 * In-memory fixed-window rate limiter for login attempts, keyed by phone + IP.
 * Memory is bounded: expired entries are pruned and the oldest entries are
 * evicted when the map exceeds `maxKeys`, so it can never grow without limit.
 */
export class LoginRateLimiter {
  private readonly maxFailures: number;
  private readonly windowMs: number;
  private readonly lockoutMs: number;
  private readonly maxKeys: number;
  private readonly attempts = new Map<string, AttemptEntry>();

  constructor(options: LoginRateLimiterOptions = {}) {
    this.maxFailures = options.maxFailures ?? DEFAULT_MAX_FAILURES;
    this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    this.lockoutMs = options.lockoutMs ?? DEFAULT_LOCKOUT_MS;
    this.maxKeys = options.maxKeys ?? DEFAULT_MAX_KEYS;
  }

  get size(): number {
    return this.attempts.size;
  }

  check(phone: string, ip?: string): void {
    const key = this.getKey(phone, ip);
    const entry = this.attempts.get(key);

    if (!entry) {
      return;
    }

    const now = Date.now();

    if (entry.blockedUntil > 0 && entry.blockedUntil > now) {
      throw new LoginRateLimitedError('Too many failed login attempts. Please try again later.');
    }

    if (now - entry.windowStart > this.windowMs) {
      this.attempts.delete(key);
    }
  }

  recordFailure(phone: string, ip?: string): void {
    const key = this.getKey(phone, ip);
    const now = Date.now();
    let entry = this.attempts.get(key);

    if (!entry || now - entry.windowStart > this.windowMs) {
      entry = { failures: 0, windowStart: now, blockedUntil: 0 };
      this.attempts.set(key, entry);
    }

    entry.failures += 1;

    if (entry.failures >= this.maxFailures) {
      entry.blockedUntil = now + this.lockoutMs;
    }

    this.enforceBoundedSize();
  }

  reset(phone: string, ip?: string): void {
    this.attempts.delete(this.getKey(phone, ip));
  }

  private getKey(phone: string, ip?: string): string {
    const resolvedIp = ip && ip !== 'unknown' ? ip : 'unknown';
    return `${resolvedIp}|${phone}`;
  }

  private enforceBoundedSize(): void {
    if (this.attempts.size <= this.maxKeys) {
      return;
    }

    const now = Date.now();

    for (const [key, entry] of this.attempts) {
      if (now - entry.windowStart > this.windowMs && entry.blockedUntil <= now) {
        this.attempts.delete(key);
      }
    }

    let surplus = this.attempts.size - this.maxKeys;

    for (const key of this.attempts.keys()) {
      if (surplus <= 0) {
        break;
      }
      this.attempts.delete(key);
      surplus -= 1;
    }
  }
}
