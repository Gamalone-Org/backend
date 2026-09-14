import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ForbiddenError } from '../../src/common/errors/AppError.js';
import { BuyerSettingsService } from '../../src/modules/buyer-settings/buyer-settings.service.js';

const USER_ID = 'user-1';
const BUYER_PROFILE_ID = '123e4567-e89b-12d3-a456-426614174500';

const defaultRow = {
  id: BUYER_PROFILE_ID,
  langue: 'fr',
  devise: 'XOF',
  notificationsEmail: false,
  notificationsSms: false,
  notificationsPush: false,
};

function buildService(overrides = {}) {
  const repository = {
    findBuyerProfileByUserId: vi.fn(),
    updateParametres: vi.fn(),
    ...overrides.repository,
  } as any;

  const service = new BuyerSettingsService(repository as any) as any;
  return { service, repository };
}

describe('BuyerSettingsService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('GET : BuyerProfile absent → ForbiddenError, aucun appel repository de mise à jour', async () => {
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue(null);

    await expect(service.getParametres(USER_ID)).rejects.toThrow(ForbiddenError);
  });

  it('PATCH : BuyerProfile absent → ForbiddenError, updateParametres jamais appelé', async () => {
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue(null);

    await expect(
      service.updateParametres(USER_ID, { langue: 'en' })
    ).rejects.toThrow(ForbiddenError);

    expect(repository.updateParametres).not.toHaveBeenCalled();
    expect(repository.findBuyerProfileByUserId).toHaveBeenCalledWith(USER_ID);
  });

  it('GET valide : mapping complet des paramètres (valeurs par défaut)', async () => {
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue({ ...defaultRow });

    const result = await service.getParametres(USER_ID);

    expect(result).toEqual({
      langue: 'fr',
      devise: 'XOF',
      notifications: { email: false, sms: false, push: false },
    });
  });

  it('PATCH langue : transmission seule de la langue au repository', async () => {
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue({ ...defaultRow });
    repository.updateParametres.mockResolvedValue({ ...defaultRow, langue: 'en' });

    const result = await service.updateParametres(USER_ID, { langue: 'en' });

    expect(repository.updateParametres).toHaveBeenCalledWith(BUYER_PROFILE_ID, {
      langue: 'en',
    });
    expect(result.langue).toBe('en');
  });

  it('PATCH devise : transmission seule de la devise (mise à jour partielle)', async () => {
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue({ ...defaultRow });
    repository.updateParametres.mockResolvedValue({ ...defaultRow, devise: 'EUR' });

    const result = await service.updateParametres(USER_ID, { devise: 'EUR' });

    expect(repository.updateParametres).toHaveBeenCalledWith(BUYER_PROFILE_ID, {
      devise: 'EUR',
    });
    expect(result.devise).toBe('EUR');
  });

  it('PATCH notifications.email : fusion depuis les valeurs actuelles', async () => {
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue({ ...defaultRow });
    repository.updateParametres.mockResolvedValue({
      ...defaultRow,
      notificationsEmail: true,
    });

    const result = await service.updateParametres(USER_ID, {
      notifications: { email: true },
    });

    expect(repository.updateParametres).toHaveBeenCalledWith(BUYER_PROFILE_ID, {
      notificationsEmail: true,
      notificationsSms: false,
      notificationsPush: false,
    });
    expect(result.notifications.email).toBe(true);
  });

  it('PATCH notifications partiel : les canaux absents conservent leur valeur actuelle (merge)', async () => {
    const current = {
      ...defaultRow,
      notificationsEmail: true,
      notificationsSms: false,
      notificationsPush: false,
    };
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue({ ...current });
    repository.updateParametres.mockResolvedValue({
      ...current,
      notificationsSms: true,
    });

    await service.updateParametres(USER_ID, { notifications: { sms: true } });

    expect(repository.updateParametres).toHaveBeenCalledWith(BUYER_PROFILE_ID, {
      notificationsEmail: true,
      notificationsSms: true,
      notificationsPush: false,
    });
  });

  it('PATCH combine langue + devise + notifications en une seule requête', async () => {
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue({ ...defaultRow });
    repository.updateParametres.mockResolvedValue({
      ...defaultRow,
      langue: 'en',
      devise: 'EUR',
      notificationsEmail: true,
    });

    const result = await service.updateParametres(USER_ID, {
      langue: 'en',
      devise: 'EUR',
      notifications: { email: true },
    });

    expect(repository.updateParametres).toHaveBeenCalledWith(BUYER_PROFILE_ID, {
      langue: 'en',
      devise: 'EUR',
      notificationsEmail: true,
      notificationsSms: false,
      notificationsPush: false,
    });
    expect(result).toEqual({
      langue: 'en',
      devise: 'EUR',
      notifications: { email: true, sms: false, push: false },
    });
  });

  it('l’id du profil transmis au repository est celui résolu depuis le userId', async () => {
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue({ ...defaultRow });
    repository.updateParametres.mockResolvedValue({ ...defaultRow });

    await service.updateParametres(USER_ID, { devise: 'USD' });

    expect(repository.findBuyerProfileByUserId).toHaveBeenCalledWith(USER_ID);
    expect(repository.updateParametres).toHaveBeenCalledWith(
      BUYER_PROFILE_ID,
      expect.any(Object)
    );
  });
});