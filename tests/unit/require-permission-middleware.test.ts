import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requirePermission } from '../../src/modules/auth/middleware/auth.middleware';
import { ForbiddenError, UnauthorizedError } from '../../src/common/errors/AppError';

const mocks = vi.hoisted(() => ({
  findAdminPermissionsByProfileId: vi.fn(),
}));

vi.mock('../../src/modules/auth/repositories/AuthRepository', () => ({
  AuthRepository: vi.fn(() => ({
    findAdminPermissionsByProfileId: mocks.findAdminPermissionsByProfileId,
  })),
}));

function makeReq(user?: Record<string, unknown> | undefined): { user?: Record<string, unknown> } {
  return { user } as never;
}

function nextSpy() {
  return vi.fn();
}

function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

const SUPER_ADMIN = {
  id: 'u1',
  role: 'ADMIN',
  adminProfileId: 'p1',
  adminAccessLevel: 'SUPER_ADMIN',
};

const SUPPORT = {
  id: 'u2',
  role: 'ADMIN',
  adminProfileId: 'p2',
  adminAccessLevel: 'SUPPORT',
};

describe('auth middleware - requirePermission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuse une requête non authentifiée', () => {
    const next = nextSpy();
    requirePermission('USERS_READ')(makeReq(), {} as never, next as never);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it('refuse un rôle non ADMIN', () => {
    const next = nextSpy();
    requirePermission('USERS_READ')(
      makeReq({ id: 'x', role: 'ARTISAN', adminProfileId: 'p', adminAccessLevel: 'SUPPORT' }),
      {} as never,
      next as never
    );
    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });

  it('refuse un ADMIN sans profil (adminProfileId manquant)', () => {
    const next = nextSpy();
    requirePermission('USERS_READ')(
      makeReq({ id: 'x', role: 'ADMIN', adminAccessLevel: 'SUPPORT' }),
      {} as never,
      next as never
    );
    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });

  it('refuse un appel sans permission demandée', () => {
    const next = nextSpy();
    requirePermission()(makeReq({ ...SUPER_ADMIN }), {} as never, next as never);
    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });

  it('laisse passer le SUPER_ADMIN sans vérification en base', () => {
    const next = nextSpy();
    requirePermission('ADMINS_READ')(makeReq({ ...SUPER_ADMIN }), {} as never, next as never);
    expect(next).toHaveBeenCalledWith();
    expect(mocks.findAdminPermissionsByProfileId).not.toHaveBeenCalled();
  });

  it('laisse passer le SUPER_ADMIN pour une permission métier', () => {
    const next = nextSpy();
    requirePermission('ORDERS_READ')(makeReq({ ...SUPER_ADMIN }), {} as never, next as never);
    expect(next).toHaveBeenCalledWith();
  });

  it('refuse une permission privilégiée ADMINS_* à un ADMIN simple (anti-escalade)', () => {
    const next = nextSpy();
    requirePermission('ADMINS_READ')(
      makeReq({ ...SUPPORT, adminProfileId: 'p2', adminAccessLevel: 'SUPPORT' }),
      {} as never,
      next as never
    );
    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    expect(mocks.findAdminPermissionsByProfileId).not.toHaveBeenCalled();
  });

  it('autorise un ADMIN détenant la permission demandée', async () => {
    mocks.findAdminPermissionsByProfileId.mockResolvedValue([{ permission: 'USERS_READ' }]);
    const next = nextSpy();
    requirePermission('USERS_READ')(makeReq({ ...SUPPORT }), {} as never, next as never);
    await flush();
    expect(mocks.findAdminPermissionsByProfileId).toHaveBeenCalledWith('p2');
    expect(next).toHaveBeenCalledWith();
  });

  it('exige le cumul de toutes les permissions demandées (ET)', async () => {
    mocks.findAdminPermissionsByProfileId.mockResolvedValue([{ permission: 'USERS_READ' }]);
    const next = nextSpy();
    requirePermission('USERS_READ', 'ORDERS_READ')(
      makeReq({ ...SUPPORT }),
      {} as never,
      next as never
    );
    await flush();
    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });

  it('refuse si la permission n’est pas détenue', async () => {
    mocks.findAdminPermissionsByProfileId.mockResolvedValue([{ permission: 'KYC_READ' }]);
    const next = nextSpy();
    requirePermission('USERS_READ')(makeReq({ ...SUPPORT }), {} as never, next as never);
    await flush();
    expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
  });

  it('transmet une erreur de base de données', async () => {
    mocks.findAdminPermissionsByProfileId.mockRejectedValue(new Error('db down'));
    const next = nextSpy();
    requirePermission('USERS_READ')(makeReq({ ...SUPPORT }), {} as never, next as never);
    await flush();
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });
});
