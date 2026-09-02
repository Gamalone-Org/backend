import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthRepository } from '../../src/modules/auth/repositories/AuthRepository.js';

function createTransactionMock() {
  const tx = {
    user: {
      create: vi.fn(),
    },
    artisanProfile: {
      create: vi.fn(),
    },
    buyerProfile: {
      create: vi.fn(),
    },
  };

  return tx;
}

function buildRepository(mockTx = createTransactionMock()) {
  const prisma = {
    $transaction: vi.fn(async (callback: (client: any) => Promise<unknown>) =>
      callback(mockTx)
    ),
    user: {
      create: vi.fn(),
    },
  };
  const repository = new AuthRepository(prisma as any);
  return { repository, prisma };
}

const acheteurInput = {
  telephone: '+22890123456',
  nom: 'Awa Mensah',
  motDePasseHash: 'hashed-password',
  role: 'ACHETEUR' as const,
  buyerProfile: { adresseLivraison: '' },
};

const artisanInput = {
  telephone: '+22890123456',
  nom: 'Atelier Kokou',
  motDePasseHash: 'hashed-password',
  role: 'ARTISAN' as const,
  artisanProfile: {
    type: 'ARTISAN' as const,
    nomAtelier: 'Atelier Kokou',
    specialite: 'Sculpture',
    localisation: 'Lomé, Togo',
    biographie: '',
    anneesExperience: 0,
  },
};

describe('AuthRepository.createUserWithCredentials integrity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('creates a User and a BuyerProfile atomically for an ACHETEUR', async () => {
    const tx = createTransactionMock();
    tx.user.create.mockResolvedValue({ id: 'user-1' });
    tx.buyerProfile.create.mockResolvedValue({ id: 'buyer-1' });
    const { repository, prisma } = buildRepository(tx);

    const result = await repository.createUserWithCredentials(acheteurInput);

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.user.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        telephone: '+22890123456',
        role: 'ACHETEUR',
        statut: 'EN_ATTENTE_VALIDATION',
        telephoneVerificationStatus: 'NON_VERIFIE',
      }),
    });
    expect(tx.buyerProfile.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        adresseLivraison: '',
      },
    });
    expect(tx.artisanProfile.create).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'user-1' });
  });

  it('defaults the BuyerProfile address to an empty string when not provided', async () => {
    const tx = createTransactionMock();
    tx.user.create.mockResolvedValue({ id: 'user-1' });
    tx.buyerProfile.create.mockResolvedValue({ id: 'buyer-1' });
    const { repository } = buildRepository(tx);

    await repository.createUserWithCredentials({ ...acheteurInput, buyerProfile: {} });

    expect(tx.buyerProfile.create).toHaveBeenCalledWith({
      data: {
        userId: 'user-1',
        adresseLivraison: '',
      },
    });
  });

  it('creates a User and an ArtisanProfile atomically for an ARTISAN', async () => {
    const tx = createTransactionMock();
    tx.user.create.mockResolvedValue({ id: 'user-2' });
    tx.artisanProfile.create.mockResolvedValue({ id: 'artisan-1' });
    const { repository } = buildRepository(tx);

    const result = await repository.createUserWithCredentials(artisanInput);

    expect(tx.artisanProfile.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-2',
        nomAtelier: 'Atelier Kokou',
        specialite: 'Sculpture',
        localisation: 'Lomé, Togo',
        type: 'ARTISAN',
      }),
    });
    expect(tx.buyerProfile.create).not.toHaveBeenCalled();
    expect(result).toEqual({ id: 'user-2' });
  });

  it('creates only the User without a transaction when the role has no profile mapping', async () => {
    const tx = createTransactionMock();
    const { repository, prisma } = buildRepository(tx);

    await repository.createUserWithCredentials({
      telephone: '+22890123456',
      nom: 'Awa Mensah',
      motDePasseHash: 'hashed-password',
      role: 'ACHETEUR',
    });

    expect(prisma.user.create).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.buyerProfile.create).not.toHaveBeenCalled();
  });

  it('rolls back the transaction (no profile) when user creation fails', async () => {
    const tx = createTransactionMock();
    tx.user.create.mockRejectedValue(new Error('P2002'));
    const { repository, prisma } = buildRepository(tx);

    await expect(repository.createUserWithCredentials(acheteurInput)).rejects.toThrow('P2002');

    expect(tx.buyerProfile.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});
