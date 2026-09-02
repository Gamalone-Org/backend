import { describe, expect, it, vi } from 'vitest';
import {
  requireAuth,
  requireRole,
  requireAdminLevel,
} from '../../src/modules/auth/middleware/auth.middleware';
import { ForbiddenError, UnauthorizedError } from '../../src/common/errors/AppError';

function makeReq(user?: Record<string, unknown>, headers: Record<string, unknown> = {}) {
  return { user, headers } as any;
}

function nextSpy() {
  return vi.fn();
}

describe('auth middleware non-regression', () => {
  describe('requireAuth', () => {
    it('rejects a missing bearer token', () => {
      const next = nextSpy();
      requireAuth(makeReq(undefined, {}), {} as any, next as any);
      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('rejects a malformed bearer token', () => {
      const next = nextSpy();
      requireAuth(makeReq(undefined, { authorization: 'Bearer' }), {} as any, next as any);
      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('rejects a non-Bearer scheme', () => {
      const next = nextSpy();
      requireAuth(makeReq(undefined, { authorization: 'Basic abc123' }), {} as any, next as any);
      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });
  });
  describe('requireRole', () => {
    it('rejects a request without an authenticated user', () => {
      const next = nextSpy();
      requireRole('ADMIN')(makeReq(), {} as any, next as any);
      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('rejects a role that is not allowed', () => {
      const next = nextSpy();
      requireRole('ADMIN')(makeReq({ role: 'ACHETEUR' }), {} as any, next as any);
      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it('allows a matching role', () => {
      const next = nextSpy();
      requireRole('ADMIN')(makeReq({ role: 'ADMIN' }), {} as any, next as any);
      expect(next).toHaveBeenCalledWith();
    });

    it('accepts multiple allowed roles', () => {
      const next = nextSpy();
      requireRole('ADMIN', 'ARTISAN')(makeReq({ role: 'ARTISAN' }), {} as any, next as any);
      expect(next).toHaveBeenCalledWith();
    });
  });

  describe('requireAdminLevel', () => {
    it('rejects a request without an authenticated user', () => {
      const next = nextSpy();
      requireAdminLevel('MODERATEUR')(makeReq(), {} as any, next as any);
      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('rejects a non-ADMIN role', () => {
      const next = nextSpy();
      requireAdminLevel('MODERATEUR')(makeReq({ role: 'ARTISAN' }), {} as any, next as any);
      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it('rejects an ADMIN with an insufficient access level', () => {
      const next = nextSpy();
      requireAdminLevel('MODERATEUR')(
        makeReq({ role: 'ADMIN', adminAccessLevel: 'SUPPORT' }),
        {} as any,
        next as any
      );
      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it('allows an ADMIN with a sufficient access level', () => {
      const next = nextSpy();
      requireAdminLevel('MODERATEUR')(
        makeReq({ role: 'ADMIN', adminAccessLevel: 'SUPER_ADMIN' }),
        {} as any,
        next as any
      );
      expect(next).toHaveBeenCalledWith();
    });
  });
});
