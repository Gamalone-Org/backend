import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoginRateLimiter } from '../../src/modules/auth/services/LoginRateLimiter';
import { LoginRateLimitedError } from '../../src/common/errors/AppError';

describe('LoginRateLimiter', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lets requests through before any failures', () => {
    const limiter = new LoginRateLimiter();
    expect(() => limiter.check('+22890123456', '127.0.0.1')).not.toThrow();
  });

  it('blocks once the failure threshold is reached and clears after the window', () => {
    vi.useFakeTimers();
    const limiter = new LoginRateLimiter({ maxFailures: 3, windowMs: 60_000, lockoutMs: 60_000 });

    limiter.recordFailure('+22890123456', '127.0.0.1');
    limiter.recordFailure('+22890123456', '127.0.0.1');
    expect(() => limiter.check('+22890123456', '127.0.0.1')).not.toThrow();

    limiter.recordFailure('+22890123456', '127.0.0.1');
    expect(() => limiter.check('+22890123456', '127.0.0.1')).toThrow(LoginRateLimitedError);

    vi.advanceTimersByTime(2 * 60_000);
    expect(() => limiter.check('+22890123456', '127.0.0.1')).not.toThrow();
  });

  it('keyes failures by phone AND IP', () => {
    const limiter = new LoginRateLimiter({ maxFailures: 1 });
    const blocked = vi.fn(() => limiter.check('+22890123456', '127.0.0.1'));

    limiter.recordFailure('+22890123456', '127.0.0.1');

    expect(blocked).toThrow(LoginRateLimitedError);
    expect(() => limiter.check('+22890123456', '10.0.0.1')).not.toThrow();
    expect(() => limiter.check('+22899999999', '127.0.0.1')).not.toThrow();
  });

  it('resets failures on a successful login', () => {
    const limiter = new LoginRateLimiter({ maxFailures: 2 });

    limiter.recordFailure('+22890123456', '127.0.0.1');
    limiter.reset('+22890123456', '127.0.0.1');

    limiter.recordFailure('+22890123456', '127.0.0.1');
    expect(() => limiter.check('+22890123456', '127.0.0.1')).not.toThrow();
  });

  it('never records more entries than the configured bound', () => {
    const limiter = new LoginRateLimiter({ maxFailures: 10, maxKeys: 3 });

    for (let i = 0; i < 10; i += 1) {
      limiter.recordFailure(`+228901234${i}`, `10.0.0.${i}`);
    }

    expect(limiter.size).toBeLessThanOrEqual(3);
  });
});
