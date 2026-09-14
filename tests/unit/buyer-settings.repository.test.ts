import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BuyerSettingsRepository } from '../../src/modules/buyer-settings/buyer-settings.repository.js';

const BUYER_PROFILE_ID = '123e4567-e89b-12d3-a456-426614174500';

const defaultRow = {
  id: BUYER_PROFILE_ID,
  langue: 'fr',
  devise: 'XOF',
  notificationsEmail: false,
  notificationsSms: false,
  notificationsPush: false,
};

function buildRepository(overrides = {}) {
  const prisma = {
    buyerProfile: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    ...overrides.prisma,
  } as any;

  const repository = new BuyerSettingsRepository(prisma as any) as any;
  return { repository, prisma };
}

describe('BuyerSettingsRepository', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('findBuyerProfileByUserId est scopé par userId (jamais un id client)', async () => {
    const { repository, prisma } = buildRepository();
    prisma.buyerProfile.findUnique.mockResolvedValue(defaultRow);

    await repository.findBuyerProfileByUserId('acheteur-A');

    expect(prisma.buyerProfile.findUnique).toHaveBeenCalledWith({
      where: { userId: 'acheteur-A' },
      select: expect.objectContaining({
        id: true,
        langue: true,
        devise: true,
        notificationsEmail: true,
        notificationsSms: true,
        notificationsPush: true,
      }),
    });
  });

  it('impossible de lire les paramètres d’un autre buyer : la clé d’accès est le userId du token', async () => {
    const { repository, prisma } = buildRepository();
    prisma.buyerProfile.findUnique.mockResolvedValue(null);

    const result = await repository.findBuyerProfileByUserId('acheteur-B');

    expect(prisma.buyerProfile.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'acheteur-B' } })
    );
    // Le profil de B n'est pas celui de A : rien n'est exposé.
    expect(result).toBeNull();
  });

  it('mise à jour correcte : where = id du BuyerProfile résolu côté serveur', async () => {
    const { repository, prisma } = buildRepository();
    const updated = { ...defaultRow, langue: 'en' };
    prisma.buyerProfile.update.mockResolvedValue(updated);

    const result = await repository.updateParametres(BUYER_PROFILE_ID, { langue: 'en' });

    expect(prisma.buyerProfile.update).toHaveBeenCalledWith({
      where: { id: BUYER_PROFILE_ID },
      data: { langue: 'en' },
      select: expect.any(Object),
    });
    expect(result.langue).toBe('en');
  });

  it('mise à jour partielle : seules les clés fournies sont transmises', async () => {
    const { repository, prisma } = buildRepository();
    prisma.buyerProfile.update.mockResolvedValue({ ...defaultRow, devise: 'EUR' });

    await repository.updateParametres(BUYER_PROFILE_ID, { devise: 'EUR' });

    expect(prisma.buyerProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ devise: 'EUR' }) })
    );
    const dataArg = (prisma.buyerProfile.update.mock.calls[0][0] as any).data;
    expect(Object.keys(dataArg)).toEqual(['devise']);
  });

  it('mise à jour des préférences notification (colonnes aplaties)', async () => {
    const { repository, prisma } = buildRepository();
    prisma.buyerProfile.update.mockResolvedValue({
      ...defaultRow,
      notificationsEmail: true,
      notificationsSms: true,
      notificationsPush: false,
    });

    await repository.updateParametres(BUYER_PROFILE_ID, {
      notificationsEmail: true,
      notificationsSms: true,
    });

    expect(prisma.buyerProfile.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { notificationsEmail: true, notificationsSms: true },
      })
    );
  });

  it('valeurs par défaut présentes via le select (langue fr, devise XOF, notifications false)', async () => {
    const { repository, prisma } = buildRepository();
    prisma.buyerProfile.findUnique.mockResolvedValue(defaultRow);

    const row = await repository.findBuyerProfileByUserId('acheteur-A');

    expect(row).toEqual(
      expect.objectContaining({
        langue: 'fr',
        devise: 'XOF',
        notificationsEmail: false,
        notificationsSms: false,
        notificationsPush: false,
      })
    );
  });
});