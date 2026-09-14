import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderService } from '../../src/modules/orders/order.service.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
} from '../../src/common/errors/AppError.js';

const ARTISAN_PROFILE_ID = '123e4567-e89b-12d3-a456-426614174111';
const CA_ID = '123e4567-e89b-12d3-a456-426614174222';

function buildService(overrides = {}) {
  const repository = {
    findArtisanProfileByUserId: vi.fn(),
    findArtisanEligibility: vi.fn(),
    findKycValidForUser: vi.fn(),
    findAllForArtisan: vi.fn(),
    getArtisanOrderCounts: vi.fn(),
    findOneForArtisan: vi.fn(),
    findArtisanCommandSummary: vi.fn(),
    advanceArtisanCommand: vi.fn(),
    ...overrides,
  } as any;
  return { service: new OrderService(repository), repository };
}

describe('OrderService artisan scope', () => {
  beforeEach(() => vi.clearAllMocks());

  it('lists only the authenticated artisan orders with per-status counts', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileByUserId.mockResolvedValue({ id: ARTISAN_PROFILE_ID });
    repository.findAllForArtisan.mockResolvedValue({ commandes: [{ id: CA_ID }], total: 1 });
    repository.getArtisanOrderCounts.mockResolvedValue({ COMMANDE: 1 });

    const result = await service.getMyCommandesArtisan('user-1', 1, 20, {
      statut: 'COMMANDE',
      q: 'awa',
    });

    expect(repository.findAllForArtisan).toHaveBeenCalledWith(ARTISAN_PROFILE_ID, 1, 20, {
      statut: 'COMMANDE',
      q: 'awa',
    });
    expect(result.total).toBe(1);
    expect(result.counts).toEqual({ COMMANDE: 1 });
  });

  it('rejects a user without an artisan profile (ForbiddenError)', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileByUserId.mockResolvedValue(null);

    await expect(
      service.getMyCommandesArtisan('user-1', 1, 20, {})
    ).rejects.toThrow(ForbiddenError);
    expect(repository.findAllForArtisan).not.toHaveBeenCalled();
  });

  it('returns the owned CommandeArtisan detail', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileByUserId.mockResolvedValue({ id: ARTISAN_PROFILE_ID });
    repository.findOneForArtisan.mockResolvedValue({ id: CA_ID, statut: 'COMMANDE' });

    const result = await service.getMyCommandeArtisan('user-1', CA_ID);

    expect(repository.findOneForArtisan).toHaveBeenCalledWith(CA_ID, ARTISAN_PROFILE_ID);
    expect(result.id).toBe(CA_ID);
  });

  it('404 when the CommandeArtisan does not belong to the artisan', async () => {
    const { service, repository } = buildService();
    repository.findArtisanProfileByUserId.mockResolvedValue({ id: ARTISAN_PROFILE_ID });
    repository.findOneForArtisan.mockResolvedValue(null);

    await expect(service.getMyCommandeArtisan('user-1', CA_ID)).rejects.toThrow(NotFoundError);
  });
});

describe('OrderService artisan transitions', () => {
  beforeEach(() => vi.clearAllMocks());

  function mockEligibleArtisan(repository: any) {
    repository.findArtisanEligibility.mockResolvedValue({
      id: ARTISAN_PROFILE_ID,
      user: { statut: 'ACTIF' },
    });
    repository.findKycValidForUser.mockResolvedValue({ id: 'kyc-1', status: 'VALIDE' });
  }

  it('preparer advances COMMANDE → PREPARATION with the global status', async () => {
    const { service, repository } = buildService();
    mockEligibleArtisan(repository);
    repository.findArtisanCommandSummary.mockResolvedValue({
      id: CA_ID,
      commandeId: 'cmd-1',
      statut: 'COMMANDE',
    });
    repository.advanceArtisanCommand.mockResolvedValue({
      commandeArtisanId: CA_ID,
      statutGlobal: 'COMMANDE',
    });
    repository.findOneForArtisan.mockResolvedValue({ id: CA_ID, statut: 'PREPARATION' });

    const result = await service.preparer('user-1', CA_ID);

    expect(repository.advanceArtisanCommand).toHaveBeenCalledWith(
      CA_ID,
      ARTISAN_PROFILE_ID,
      'COMMANDE',
      'PREPARATION'
    );
    expect(result.commandeArtisan.statut).toBe('PREPARATION');
    expect(result.statutGlobal).toBe('COMMANDE');
  });

  it('expedier advances PREPARATION → EXPEDIEE', async () => {
    const { service, repository } = buildService();
    mockEligibleArtisan(repository);
    repository.findArtisanCommandSummary.mockResolvedValue({
      id: CA_ID,
      commandeId: 'cmd-1',
      statut: 'PREPARATION',
    });
    repository.advanceArtisanCommand.mockResolvedValue({
      commandeArtisanId: CA_ID,
      statutGlobal: 'EXPEDIEE',
    });
    repository.findOneForArtisan.mockResolvedValue({ id: CA_ID, statut: 'EXPEDIEE' });

    const result = await service.expedier('user-1', CA_ID);

    expect(repository.advanceArtisanCommand).toHaveBeenCalledWith(
      CA_ID,
      ARTISAN_PROFILE_ID,
      'PREPARATION',
      'EXPEDIEE'
    );
    expect(result.statutGlobal).toBe('EXPEDIEE');
  });

  it('rejects a non-ACTIF artisan with ForbiddenError without writing', async () => {
    const { service, repository } = buildService();
    repository.findArtisanEligibility.mockResolvedValue({
      id: ARTISAN_PROFILE_ID,
      user: { statut: 'EN_ATTENTE_VALIDATION' },
    });

    await expect(service.preparer('user-1', CA_ID)).rejects.toThrow(ForbiddenError);
    expect(repository.findKycValidForUser).not.toHaveBeenCalled();
    expect(repository.findArtisanCommandSummary).not.toHaveBeenCalled();
    expect(repository.advanceArtisanCommand).not.toHaveBeenCalled();
  });

  it('rejects a non-ACTIF artisan for expedier as well', async () => {
    const { service, repository } = buildService();
    repository.findArtisanEligibility.mockResolvedValue({
      id: ARTISAN_PROFILE_ID,
      user: { statut: 'INACTIF' },
    });

    await expect(service.expedier('user-1', CA_ID)).rejects.toThrow(ForbiddenError);
    expect(repository.advanceArtisanCommand).not.toHaveBeenCalled();
  });

  it('rejects an artisan without a validated KYC with ForbiddenError', async () => {
    const { service, repository } = buildService();
    mockEligibleArtisan(repository);
    repository.findKycValidForUser.mockResolvedValue(null);

    await expect(service.preparer('user-1', CA_ID)).rejects.toThrow(ForbiddenError);
    expect(repository.findArtisanCommandSummary).not.toHaveBeenCalled();
    expect(repository.advanceArtisanCommand).not.toHaveBeenCalled();
  });

  it('rejects an invalid transition with ConflictError', async () => {
    const { service, repository } = buildService();
    mockEligibleArtisan(repository);
    repository.findArtisanCommandSummary.mockResolvedValue({
      id: CA_ID,
      commandeId: 'cmd-1',
      statut: 'PREPARATION',
    });

    await expect(service.preparer('user-1', CA_ID)).rejects.toThrow(ConflictError);
    expect(repository.advanceArtisanCommand).not.toHaveBeenCalled();
  });

  it('rejects expedier directly from COMMANDE with ConflictError', async () => {
    const { service, repository } = buildService();
    mockEligibleArtisan(repository);
    repository.findArtisanCommandSummary.mockResolvedValue({
      id: CA_ID,
      commandeId: 'cmd-1',
      statut: 'COMMANDE',
    });

    await expect(service.expedier('user-1', CA_ID)).rejects.toThrow(ConflictError);
    expect(repository.advanceArtisanCommand).not.toHaveBeenCalled();
  });

  it('404 when the CommandeArtisan is not found', async () => {
    const { service, repository } = buildService();
    mockEligibleArtisan(repository);
    repository.findArtisanCommandSummary.mockResolvedValue(null);

    await expect(service.preparer('user-1', CA_ID)).rejects.toThrow(NotFoundError);
  });

  it('409 on concurrent modification (advance returned nothing)', async () => {
    const { service, repository } = buildService();
    mockEligibleArtisan(repository);
    repository.findArtisanCommandSummary.mockResolvedValue({
      id: CA_ID,
      commandeId: 'cmd-1',
      statut: 'COMMANDE',
    });
    repository.advanceArtisanCommand.mockResolvedValue(null);

    await expect(service.preparer('user-1', CA_ID)).rejects.toThrow(ConflictError);
  });
});