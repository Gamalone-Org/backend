import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type PrismaClient, type Prisma } from '../../src/generated/prisma/client.js';
import { BootstrapSuperAdminService } from '../../src/modules/admin/administrateurs/bootstrap-super-admin.service';
import { ConflictError } from '../../src/common/errors/AppError';
import { PhoneService } from '../../src/modules/auth/services/PhoneService';

const SUPER_ADMIN_COUNT_WHERE = {
  where: {
    role: 'ADMIN',
    statut: 'ACTIF',
    adminProfile: { is: { niveauAcces: 'SUPER_ADMIN' } },
  },
};

function makeTx() {
  const userCreate = vi.fn();
  const adminProfileCreate = vi.fn();
  const auditLogCreate = vi.fn();
  const tx = {
    user: { create: userCreate },
    adminProfile: { create: adminProfileCreate },
    adminAuditLog: { create: auditLogCreate },
  } as unknown as Prisma.TransactionClient;
  return { tx, mocks: { userCreate, adminProfileCreate, auditLogCreate } };
}

function makeFixture() {
  const { tx, mocks: txMocks } = makeTx();
  const userCount = vi.fn();
  const userFindUnique = vi.fn();
  const prisma = {
    $transaction: vi.fn((arg: unknown) => {
      if (typeof arg === 'function') {
        return Promise.resolve((arg as (t: unknown) => unknown)(tx));
      }
      return Promise.all(arg as Promise<unknown>[]);
    }),
    user: {
      count: userCount,
      findUnique: userFindUnique,
    },
  } as unknown as PrismaClient;

  const passwordService = { hash: vi.fn() };

  const service = new BootstrapSuperAdminService(
    prisma,
    passwordService as never,
    new PhoneService()
  );

  return { service, prisma, tx, mocks: { ...txMocks, userCount, userFindUnique }, passwordService };
}

describe('BootstrapSuperAdminService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const validInput = {
    telephone: '+22890123456',
    motDePasse: 'S3cretPass!',
    nom: 'Awa Mensah',
    email: 'awa@exemple.com',
    departement: 'Direction',
  };

  it('crée le premier SUPER_ADMIN atomiquement sans exposer le mot de passe ni le hash', async () => {
    const { service, mocks, passwordService } = makeFixture();
    mocks.userCount.mockResolvedValue(0);
    mocks.userFindUnique.mockResolvedValue(null);
    passwordService.hash.mockResolvedValue('scrypt$cache$hash');
    mocks.userCreate.mockResolvedValue({ id: 'user-1' });
    mocks.adminProfileCreate.mockResolvedValue({ id: 'profile-1' });

    const result = await service.execute(validInput);

    // Aucun SUPER_ADMIN existant -> vérification de départ.
    expect(mocks.userCount).toHaveBeenCalledWith(SUPER_ADMIN_COUNT_WHERE);
    // Unicité téléphone/e-mail.
    expect(mocks.userFindUnique).toHaveBeenCalledTimes(2);
    // Le mot de passe est hashé par le service officiel, jamais stocké en clair.
    expect(passwordService.hash).toHaveBeenCalledWith('S3cretPass!');
    expect(mocks.userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          telephone: '+22890123456',
          email: 'awa@exemple.com',
          role: 'ADMIN',
          statut: 'ACTIF',
          telephoneVerificationStatus: 'VERIFIE',
          motDePasse: 'scrypt$cache$hash',
        }),
      })
    );
    // Création du profil SUPER_ADMIN + trace d'audit.
    expect(mocks.adminProfileCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ userId: 'user-1', niveauAcces: 'SUPER_ADMIN' }),
      })
    );
    expect(mocks.auditLogCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'CREATE_ADMIN',
          actorAdminId: null,
          targetAdminId: 'profile-1',
        }),
      })
    );

    // Aucun secret ne doit se retrouver dans la valeur de retour.
    expect(result).toEqual({
      userId: 'user-1',
      adminProfileId: 'profile-1',
      telephone: '+22890123456',
      nom: 'Awa Mensah',
      email: 'awa@exemple.com',
      departement: 'Direction',
    });
    expect(JSON.stringify(result)).not.toContain('S3cretPass!');
    expect(JSON.stringify(result)).not.toContain('scrypt');
  });

  it('refuse de s’exécuter si un SUPER_ADMIN actif existe déjà', async () => {
    const { service, mocks } = makeFixture();
    mocks.userCount.mockResolvedValue(1);

    await expect(service.execute(validInput)).rejects.toBeInstanceOf(ConflictError);
    expect(mocks.userCreate).not.toHaveBeenCalled();
    expect(mocks.adminProfileCreate).not.toHaveBeenCalled();
  });

  it('refuse un téléphone ou un mot de passe manquant', async () => {
    const { service, mocks } = makeFixture();
    mocks.userCount.mockResolvedValue(0);

    await expect(
      service.execute({ telephone: '', motDePasse: 'S3cretPass!' })
    ).rejects.toBeInstanceOf(ConflictError);
    await expect(
      service.execute({ telephone: '+22890123456', motDePasse: '' })
    ).rejects.toBeInstanceOf(ConflictError);
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });

  it('refuse un téléphone déjà utilisé', async () => {
    const { service, mocks } = makeFixture();
    mocks.userCount.mockResolvedValue(0);
    mocks.userFindUnique.mockResolvedValue({ id: 'autre-compte' });

    await expect(service.execute(validInput)).rejects.toBeInstanceOf(ConflictError);
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });

  it('refuse un e-mail déjà utilisé', async () => {
    const { service, mocks } = makeFixture();
    mocks.userCount.mockResolvedValue(0);
    mocks.userFindUnique.mockImplementationOnce((args: { where: { email?: string } }) =>
      Promise.resolve(args.where.email ? { id: 'autre-compte' } : null)
    );

    await expect(service.execute(validInput)).rejects.toBeInstanceOf(ConflictError);
    expect(mocks.userCreate).not.toHaveBeenCalled();
  });

  it('normalise le téléphone avant création (PhoneService officiel)', async () => {
    const { service, mocks, passwordService } = makeFixture();
    mocks.userCount.mockResolvedValue(0);
    mocks.userFindUnique.mockResolvedValue(null);
    passwordService.hash.mockResolvedValue('scrypt$cache$hash');
    mocks.userCreate.mockResolvedValue({ id: 'user-1' });
    mocks.adminProfileCreate.mockResolvedValue({ id: 'profile-1' });

    await service.execute({ ...validInput, telephone: '228 90 1234 56' });

    // Format international normalisé utilisateur par l'API GAMALONE.
    expect(mocks.userCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ telephone: '+22890123456' }),
      })
    );
  });

  it('écrase e-mail et nom optionnels vers des valeurs sûres lorsque absents', async () => {
    const { service, mocks, passwordService } = makeFixture();
    mocks.userCount.mockResolvedValue(0);
    mocks.userFindUnique.mockResolvedValue(null);
    passwordService.hash.mockResolvedValue('scrypt$cache$hash');
    mocks.userCreate.mockResolvedValue({ id: 'user-1' });
    mocks.adminProfileCreate.mockResolvedValue({ id: 'profile-1' });

    const result = await service.execute({
      telephone: '+22890123456',
      motDePasse: 'S3cretPass!',
    });

    expect(result.email).toBeNull();
    expect(result.nom).toBe('');
    expect(result.departement).toBe('');
    // Un seul appel findUnique (téléphone), pas d'e-mail à vérifier.
    expect(mocks.userFindUnique).toHaveBeenCalledTimes(1);
  });
});
