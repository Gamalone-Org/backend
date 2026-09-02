import { beforeEach, describe, expect, it, vi } from 'vitest';
import { UserRepository } from '../../src/modules/users/users.repository.js';

function createTxMock() {
  return {
    user: {
      create: vi.fn(),
      update: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
    artisanProfile: { create: vi.fn() },
    buyerProfile: { create: vi.fn() },
    adminProfile: {
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
  } as any;
}

function buildRepository(mockTx = createTxMock()) {
  const prisma = {
    $transaction: vi.fn(async (arg: any) => {
      if (Array.isArray(arg)) {
        return Promise.all(arg.map((p) => Promise.resolve(p)));
      }
      return arg(mockTx);
    }),
    user: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  };
  const repository = new UserRepository(prisma as any);
  return { repository, prisma, mockTx };
}

const USER_ID = '123e4567-e89b-12d3-a456-426614174010';
const PHONE = '+22890123456';
const EMAIL = 'test@example.com';

const prismaUser = {
  id: USER_ID,
  email: EMAIL,
  nom: 'Test',
  telephone: PHONE,
  role: 'ACHETEUR',
  statut: 'ACTIF',
  createdAt: new Date(),
  updatedAt: new Date(),
  artisanProfile: null,
  buyerProfile: null,
  adminProfile: null,
};

describe('UserRepository - liste & recherches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('construit la requête avec recherche q et combinaison de filtres', async () => {
    const { repository, prisma } = buildRepository();
    prisma.user.count.mockResolvedValue(1);
    prisma.user.findMany.mockResolvedValue([prismaUser]);

    await repository.listUsers({
      page: 2,
      limit: 10,
      q: 'awa',
      role: 'ACHETEUR',
      statut: 'SUSPENDU',
      bloques: true,
    });

    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where.role).toBe('ACHETEUR');
    expect(where.statut).toBe('SUSPENDU'); // bloques=true => statut SUSPENDU
    expect(where.deletedAt).toBeNull();
    expect(where.OR).toEqual([
      { nom: { contains: 'awa', mode: 'insensitive' } },
      { email: { contains: 'awa', mode: 'insensitive' } },
      { telephone: { contains: 'awa' } },
    ]);
    expect(prisma.user.count).toHaveBeenCalled();
  });

  it('exclut les utilisateurs soft-deleted', async () => {
    const { repository, prisma } = buildRepository();
    prisma.user.count.mockResolvedValue(0);
    prisma.user.findMany.mockResolvedValue([]);
    await repository.listUsers({ page: 1, limit: 20 });
    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where.deletedAt).toBeNull();
  });

  it('filtrer les bloqués (SUSPENDU) selon le flag bloques=true', async () => {
    const { repository, prisma } = buildRepository();
    prisma.user.count.mockResolvedValue(0);
    prisma.user.findMany.mockResolvedValue([]);
    await repository.listUsers({ page: 1, limit: 20, bloques: true });
    const where = prisma.user.findMany.mock.calls[0][0].where;
    expect(where.statut).toBe('SUSPENDU');
  });
});

describe('UserRepository - création atomique', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('crée User + BuyerProfile dans une transaction pour un ACHETEUR', async () => {
    const { repository, prisma, mockTx } = buildRepository();
    mockTx.user.create.mockResolvedValue({ id: USER_ID });
    mockTx.user.findUniqueOrThrow.mockResolvedValue(prismaUser);

    await repository.createUser({
      telephone: PHONE,
      role: 'ACHETEUR',
      motDePasseHash: 'hash',
      buyerProfile: { adresseLivraison: 'Lomé' },
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockTx.buyerProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: USER_ID, adresseLivraison: 'Lomé' }),
    });
  });

  it('crée User + ArtisanProfile dans une transaction pour un ARTISAN', async () => {
    const { repository, mockTx } = buildRepository();
    mockTx.user.create.mockResolvedValue({ id: USER_ID });
    mockTx.user.findUniqueOrThrow.mockResolvedValue(prismaUser);

    await repository.createUser({
      telephone: PHONE,
      role: 'ARTISAN',
      motDePasseHash: 'hash',
      artisanProfile: {
        nomAtelier: 'Atelier Awa',
        specialite: 'Sculpture',
        localisation: 'Lomé',
      },
    });

    expect(mockTx.artisanProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: USER_ID, nomAtelier: 'Atelier Awa' }),
    });
  });

  it('crée User + AdminProfile dans une transaction pour un ADMIN', async () => {
    const { repository, mockTx } = buildRepository();
    mockTx.user.create.mockResolvedValue({ id: USER_ID });
    mockTx.user.findUniqueOrThrow.mockResolvedValue(prismaUser);

    await repository.createUser({
      telephone: PHONE,
      role: 'ADMIN',
      motDePasseHash: 'hash',
      niveauAcces: 'MODERATEUR',
    });

    expect(mockTx.adminProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: USER_ID, niveauAcces: 'MODERATEUR' }),
    });
  });
});

describe('UserRepository - changement de rôle transactionnel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('crée l’AdminProfile quand la cible devient ADMIN', async () => {
    const { repository, mockTx } = buildRepository();
    mockTx.user.update.mockResolvedValue(prismaUser);
    await repository.changeRole(USER_ID, 'ADMIN', 'SUPPORT', false);
    expect(mockTx.adminProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: USER_ID, niveauAcces: 'SUPPORT' }),
    });
    expect(mockTx.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        data: { role: 'ADMIN' },
      })
    );
  });

  it('met à jour le niveau d’accès d’un admin existant', async () => {
    const { repository, mockTx } = buildRepository();
    mockTx.user.update.mockResolvedValue(prismaUser);
    await repository.changeRole(USER_ID, 'ADMIN', 'SUPER_ADMIN', true);
    expect(mockTx.adminProfile.update).toHaveBeenCalledWith({
      where: { userId: USER_ID },
      data: { niveauAcces: 'SUPER_ADMIN' },
    });
  });

  it('supprime l’AdminProfile quand la cible quitte le rôle ADMIN', async () => {
    const { repository, mockTx } = buildRepository();
    mockTx.user.update.mockResolvedValue(prismaUser);
    await repository.changeRole(USER_ID, 'ACHETEUR', undefined, true);
    expect(mockTx.adminProfile.deleteMany).toHaveBeenCalledWith({
      where: { userId: USER_ID },
    });
  });

  it('ne touche pas l’AdminProfile quand la cible quitte un rôle non-ADMIN', async () => {
    const { repository, mockTx } = buildRepository();
    mockTx.user.update.mockResolvedValue(prismaUser);
    await repository.changeRole(USER_ID, 'ACHETEUR', undefined, false);
    expect(mockTx.adminProfile.create).not.toHaveBeenCalled();
    expect(mockTx.adminProfile.deleteMany).not.toHaveBeenCalled();
  });
});
