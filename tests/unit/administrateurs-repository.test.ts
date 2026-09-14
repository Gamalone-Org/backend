import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '../../src/generated/prisma/client.js';
import { AdministrateurRepository } from '../../src/modules/admin/administrateurs/administrateurs.repository';

const PROFILE_ID = '123e4567-e89b-12d3-a456-426614174010';

function makeTx() {
  const userCreate = vi.fn();
  const userUpdate = vi.fn();
  const adminProfileCreate = vi.fn();
  const adminProfileFindUniqueOrThrow = vi.fn();
  const adminProfileUpdate = vi.fn();
  const permCreateMany = vi.fn();
  const permDeleteMany = vi.fn();
  const auditLogCreate = vi.fn();
  const tx = {
    user: { create: userCreate, update: userUpdate },
    adminProfile: {
      create: adminProfileCreate,
      findUniqueOrThrow: adminProfileFindUniqueOrThrow,
      update: adminProfileUpdate,
    },
    adminProfilePermission: { createMany: permCreateMany, deleteMany: permDeleteMany },
    adminAuditLog: { create: auditLogCreate },
  };
  return {
    tx,
    mocks: {
      userCreate,
      userUpdate,
      adminProfileCreate,
      adminProfileFindUniqueOrThrow,
      adminProfileUpdate,
      permCreateMany,
      permDeleteMany,
      auditLogCreate,
    },
  };
}

function makePrisma() {
  const { tx, mocks } = makeTx();
  const userCount = vi.fn();
  const userFindMany = vi.fn();
  const userFindUnique = vi.fn();
  const userUpdateMany = vi.fn();
  const adminProfileFindUnique = vi.fn();
  const auditLogCreate = vi.fn();
  const prisma = {
    $transaction: vi.fn((arg: unknown) => {
      if (typeof arg === 'function') {
        return Promise.resolve((arg as (t: unknown) => unknown)(tx));
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
    user: {
      count: userCount,
      findMany: userFindMany,
      findUnique: userFindUnique,
      updateMany: userUpdateMany,
    },
    adminProfile: { findUnique: adminProfileFindUnique },
    adminAuditLog: { create: auditLogCreate },
  };
  return {
    prisma: prisma as never,
    mocks: {
      ...mocks,
      userCount,
      userFindMany,
      userFindUnique,
      userUpdateMany,
      adminProfileFindUnique,
      auditLogCreate,
    },
  };
}

describe('AdministrateurRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('list filtre les utilisateurs ADMIN avec pagination (Array $transaction)', async () => {
    const { prisma, mocks } = makePrisma();
    mocks.userCount.mockResolvedValue(3);
    mocks.userFindMany.mockResolvedValue([{ id: 'u', adminProfile: null }]);
    const repo = new AdministrateurRepository(prisma);

    const result = await repo.list({
      page: 2,
      limit: 10,
      q: 'awa',
      statut: 'ACTIF',
      niveauAcces: 'SUPPORT',
    });

    expect(result).toEqual({
      items: [{ id: 'u', adminProfile: null }],
      total: 3,
      page: 2,
      limit: 10,
    });
    expect(mocks.userCount).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          role: 'ADMIN',
          statut: 'ACTIF',
          adminProfile: { is: { niveauAcces: 'SUPPORT' } },
          OR: expect.any(Array),
        }),
      })
    );
    expect(mocks.userFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ role: 'ADMIN' }),
        skip: 10,
        take: 10,
      })
    );
  });

  it('findById retourne null quand le profil n’existe pas', async () => {
    const { prisma, mocks } = makePrisma();
    mocks.adminProfileFindUnique.mockResolvedValue(null);
    const repo = new AdministrateurRepository(prisma);
    await expect(repo.findById(PROFILE_ID)).resolves.toBeNull();
  });

  it('findById mappe le profil AdminProfile + permissions + user', async () => {
    const { prisma, mocks } = makePrisma();
    mocks.adminProfileFindUnique.mockResolvedValue({
      id: PROFILE_ID,
      niveauAcces: 'MODERATEUR',
      departement: 'Tech',
      createdAt: new Date(),
      updatedAt: new Date(),
      permissions: [{ permission: 'ORDERS_READ' }],
      user: {
        id: 'u-cible',
        email: 'cible@example.com',
        nom: 'Cible',
        telephone: '+22890123456',
        statut: 'ACTIF',
        role: 'ADMIN',
        createdAt: new Date(),
        updatedAt: new Date(),
        telephoneVerificationStatus: 'VERIFIE',
        telephoneVerifiedAt: new Date(),
      },
    });
    const repo = new AdministrateurRepository(prisma);

    const result = await repo.findById(PROFILE_ID);

    expect(result).toMatchObject({
      id: 'u-cible',
      telephone: '+22890123456',
      statut: 'ACTIF',
      role: 'ADMIN',
      adminProfile: {
        id: PROFILE_ID,
        niveauAcces: 'MODERATEUR',
        departement: 'Tech',
        permissions: [{ permission: 'ORDERS_READ' }],
      },
    });
  });

  it('createAdministrateur crée User (ACTIF/VERIFIE) + AdminProfile + permissions', async () => {
    const { prisma, mocks } = makePrisma();
    mocks.userCreate.mockResolvedValue({ id: 'u-cible' });
    mocks.adminProfileCreate.mockResolvedValue({ id: PROFILE_ID });

    const repo = new AdministrateurRepository(prisma);
    const result = await repo.createAdministrateur({
      telephone: '+22890123456',
      email: null,
      nom: 'Awa',
      motDePasseHash: 'hash',
      niveauAcces: 'MODERATEUR',
      departement: 'Tech',
      permissions: ['ORDERS_READ', 'ORDERS_UPDATE'],
    });

    expect(result).toEqual({ userId: 'u-cible', adminProfileId: PROFILE_ID });
    expect(mocks.userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          role: 'ADMIN',
          statut: 'ACTIF',
          telephoneVerificationStatus: 'VERIFIE',
          motDePasse: 'hash',
        }),
      })
    );
    expect(mocks.adminProfileCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ niveauAcces: 'MODERATEUR', departement: 'Tech' }),
      })
    );
    expect(mocks.permCreateMany).toHaveBeenCalledWith({
      data: [
        { adminProfileId: PROFILE_ID, permission: 'ORDERS_READ' },
        { adminProfileId: PROFILE_ID, permission: 'ORDERS_UPDATE' },
      ],
    });
  });

  it('createAdministrateur sans permissions n’appelle pas createMany', async () => {
    const { prisma, mocks } = makePrisma();
    mocks.userCreate.mockResolvedValue({ id: 'u-cible' });
    mocks.adminProfileCreate.mockResolvedValue({ id: PROFILE_ID });
    const repo = new AdministrateurRepository(prisma);
    await repo.createAdministrateur({
      telephone: '+22890123456',
      email: null,
      nom: 'Awa',
      motDePasseHash: 'hash',
      niveauAcces: 'SUPPORT',
      departement: '',
      permissions: [],
    });
    expect(mocks.permCreateMany).not.toHaveBeenCalled();
  });

  it('updateAdministrateur met à jour efficient departement + user nom/email', async () => {
    const { prisma, mocks } = makePrisma();
    mocks.adminProfileFindUniqueOrThrow.mockResolvedValue({ userId: 'u-cible' });

    const repo = new AdministrateurRepository(prisma);
    await repo.updateAdministrateur(PROFILE_ID, { nom: 'Awa', departement: 'Ops' });

    expect(mocks.adminProfileFindUniqueOrThrow).toHaveBeenCalledWith({ where: { id: PROFILE_ID } });
    expect(mocks.adminProfileUpdate).toHaveBeenCalledWith({
      where: { id: PROFILE_ID },
      data: { departement: 'Ops' },
    });
    expect(mocks.userUpdate).toHaveBeenCalledWith({
      where: { id: 'u-cible' },
      data: { nom: 'Awa' },
    });
  });

  it('setPermissions remplace la liste (deleteMany puis createMany)', async () => {
    const { prisma, mocks } = makePrisma();
    mocks.permDeleteMany.mockResolvedValue({ count: 2 });
    mocks.permCreateMany.mockResolvedValue({ count: 1 });
    const repo = new AdministrateurRepository(prisma);

    await repo.setPermissions(PROFILE_ID, ['ORDERS_READ']);

    expect(mocks.permDeleteMany).toHaveBeenCalledWith({ where: { adminProfileId: PROFILE_ID } });
    expect(mocks.permCreateMany).toHaveBeenCalledWith({
      data: [{ adminProfileId: PROFILE_ID, permission: 'ORDERS_READ' }],
    });
  });

  it('updateStatut passe par updateMany sur le User lié au profil', async () => {
    const { prisma, mocks } = makePrisma();
    mocks.userUpdateMany.mockResolvedValue({ count: 1 });
    const repo = new AdministrateurRepository(prisma);

    const count = await repo.updateStatut(PROFILE_ID, 'INACTIF');

    expect(count).toBe(1);
    expect(mocks.userUpdateMany).toHaveBeenCalledWith({
      where: { role: 'ADMIN', adminProfile: { is: { id: PROFILE_ID } } },
      data: { statut: 'INACTIF' },
    });
  });

  it('countActiveByNiveauAcces compte les utilisateurs SUPER_ADMIN actifs', async () => {
    const { prisma, mocks } = makePrisma();
    mocks.userCount.mockResolvedValue(1);
    const repo = new AdministrateurRepository(prisma);

    const count = await repo.countActiveByNiveauAcces('SUPER_ADMIN');

    expect(count).toBe(1);
    expect(mocks.userCount).toHaveBeenCalledWith({
      where: {
        role: 'ADMIN',
        statut: 'ACTIF',
        adminProfile: { is: { niveauAcces: 'SUPER_ADMIN' } },
      },
    });
  });

  it('logAudit crée une entrée d’audit', async () => {
    const { prisma, mocks } = makePrisma();
    mocks.auditLogCreate.mockResolvedValue({ id: 'log-1' });
    const repo = new AdministrateurRepository(prisma);

    await repo.logAudit('CREATE_ADMIN', 'p-a', 'p-b', { viaBootstrap: true });

    expect(mocks.auditLogCreate).toHaveBeenCalledWith({
      data: {
        action: 'CREATE_ADMIN',
        actorAdminId: 'p-a',
        targetAdminId: 'p-b',
        details: { viaBootstrap: true },
      },
    });
  });

  it('isUniqueConstraintError détecte les erreurs P2002', () => {
    const { prisma } = makePrisma();
    const repo = new AdministrateurRepository(prisma);
    expect(
      repo.isUniqueConstraintError(
        new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' })
      )
    ).toBe(true);
    expect(repo.isUniqueConstraintError(new Error('autre'))).toBe(false);
  });
});
