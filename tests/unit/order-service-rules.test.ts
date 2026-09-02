import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OrderService } from '../../src/modules/orders/order.service';
import {
  ForbiddenError,
  ConflictError,
  NotFoundError,
} from '../../src/common/errors/AppError';

function buildService(overrides = {}) {
  const repository = {
    findBuyerProfileByUserId: vi.fn(),
    findOeuvreById: vi.fn(),
    createCommande: vi.fn(),
    findByIdMine: vi.fn(),
    findForAcheteur: vi.fn(),
    findByIdDetailed: vi.fn(),
    findByIdSummary: vi.fn(),
    findForAdmin: vi.fn(),
    updateStatut: vi.fn(),
    ...overrides,
  } as any;
  return { service: new OrderService(repository), repository };
}

const OEUVRE_ID = '123e4567-e89b-12d3-a456-426614174000';
const OEUVRE_2_ID = '123e4567-e89b-12d3-a456-426614174001';
const ARTISAN_ID = '123e4567-e89b-12d3-a456-426614174111';

function makeOeuvre(overrides = {}) {
  return {
    id: OEUVRE_ID,
    artisanId: ARTISAN_ID,
    statut: 'PUBLIEE',
    titre: 'Sculpture',
    prixXOF: 10000,
    artisan: { id: ARTISAN_ID, commission: 10 },
    ...overrides,
  };
}

const validInput = {
  articles: [{ oeuvreId: OEUVRE_ID, quantite: 2 }],
  adresseLivraison: 'Lomé, Tokoin',
  transporteur: 'DHL',
  fraisLivraison: 1000,
  methodePaiement: 'MOBILE_MONEY',
};

// Workflow normal : COMMANDE → PREPARATION → EXPEDIEE → LIVREE → CLOTUREE
const VALID_TRANSITIONS = [
  ['COMMANDE', 'PREPARATION'],
  ['PREPARATION', 'EXPEDIEE'],
  ['EXPEDIEE', 'LIVREE'],
  ['LIVREE', 'CLOTUREE'],
] as const;

const FORBIDDEN_TRANSITIONS = [
  ['COMMANDE', 'EXPEDIEE'],
  ['COMMANDE', 'LIVREE'],
  ['COMMANDE', 'CLOTUREE'],
  ['PREPARATION', 'LIVREE'],
  ['PREPARATION', 'CLOTUREE'],
  ['EXPEDIEE', 'CLOTUREE'],
  ['LIVREE', 'EXPEDIEE'],
  ['LIVREE', 'PREPARATION'],
  ['CLOTUREE', 'LIVREE'],
  ['CLOTUREE', 'PREPARATION'],
  ['CLOTUREE', 'EXPEDIEE'],
] as const;

describe('OrderService business rules', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('refuses creation when the buyer profile does not exist', async () => {
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue(null);

    await expect(
      service.createCommande('user-1', validInput)
    ).rejects.toThrow(ForbiddenError);
    expect(repository.createCommande).not.toHaveBeenCalled();
  });

  it('refuses creation when an artwork does not exist', async () => {
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue({ id: 'bp-1' });
    repository.findOeuvreById.mockResolvedValue(null);

    await expect(
      service.createCommande('user-1', validInput)
    ).rejects.toThrow(NotFoundError);
    expect(repository.createCommande).not.toHaveBeenCalled();
  });

  it('refuses creation when an artwork is not available (not PUBLIEE)', async () => {
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue({ id: 'bp-1' });
    repository.findOeuvreById.mockResolvedValue(makeOeuvre({ statut: 'VENDUE' }));

    await expect(
      service.createCommande('user-1', validInput)
    ).rejects.toThrow(ConflictError);
    expect(repository.createCommande).not.toHaveBeenCalled();
  });

  it('computes sous-total, commission, frais and total, then creates the order in one transaction', async () => {
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue({ id: 'bp-1' });
    repository.findOeuvreById.mockResolvedValueOnce(makeOeuvre()); // 10000 x 2
    repository.findOeuvreById.mockResolvedValueOnce(
      makeOeuvre({ id: OEUVRE_2_ID, prixXOF: 5000 })
    );
    repository.createCommande.mockResolvedValue({ id: 'cmd-1' });
    repository.findByIdMine.mockResolvedValue({ id: 'cmd-1' });

    const input = {
      ...validInput,
      articles: [
        { oeuvreId: OEUVRE_ID, quantite: 2 }, // 20000
        { oeuvreId: OEUVRE_2_ID, quantite: 1 }, // 5000
      ],
      fraisLivraison: 2500,
    };

    const result = await service.createCommande('user-1', input);

    expect(repository.createCommande).toHaveBeenCalledWith({
      acheteurId: 'bp-1',
      lignes: [
        { oeuvreId: OEUVRE_ID, artisanId: ARTISAN_ID, prixUnitaire: 10000, quantite: 2 },
        { oeuvreId: OEUVRE_2_ID, artisanId: ARTISAN_ID, prixUnitaire: 5000, quantite: 1 },
      ],
      sousTotal: 25000,
      fraisLivraison: 2500,
      montantTotal: 27500,
      commission: 2500, // 10% of 25000
      methodePaiement: 'MOBILE_MONEY',
      adresseDest: 'Lomé, Tokoin',
      transporteur: 'DHL',
    });

    expect(result.recapitulatif).toEqual({
      sousTotal: 25000,
      fraisLivraison: 2500,
      total: 27500,
      commission: 2500,
    });
  });

  it('derives the price from the server, never from the client', async () => {
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue({ id: 'bp-1' });
    repository.findOeuvreById.mockResolvedValue(makeOeuvre({ prixXOF: 80000 }));
    repository.createCommande.mockResolvedValue({ id: 'cmd-1' });
    repository.findByIdMine.mockResolvedValue({ id: 'cmd-1' });

    await service.createCommande('user-1', validInput);

    const call = repository.createCommande.mock.calls[0][0] as any;
    expect(call.lignes[0].prixUnitaire).toBe(80000);
    expect(call.lignes[0].quantite).toBe(2);
    expect(call.montantTotal).toBe(80000 * 2 + validInput.fraisLivraison);
  });

  it('forbids access to an order belonging to another buyer', async () => {
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue({ id: 'bp-1' });
    repository.findByIdMine.mockResolvedValue(null);

    await expect(
      service.getMyCommande('user-1', 'cmd-999')
    ).rejects.toThrow(NotFoundError);
  });

  it('returns the order for its owner', async () => {
    const { service, repository } = buildService();
    repository.findBuyerProfileByUserId.mockResolvedValue({ id: 'bp-1' });
    repository.findByIdMine.mockResolvedValue({ id: 'cmd-1', statut: 'COMMANDE' });

    const result = await service.getMyCommande('user-1', 'cmd-1');
    expect(result.id).toBe('cmd-1');
    expect(repository.findByIdMine).toHaveBeenCalledWith('cmd-1', 'bp-1');
  });

  it.each(VALID_TRANSITIONS)(
    'allows the valid transition %s → %s',
    async (from, to) => {
      const { service, repository } = buildService();
      repository.findByIdSummary.mockResolvedValue({
        id: 'cmd-1',
        statut: from,
        acheteurId: 'bp-1',
      });
      repository.updateStatut.mockResolvedValue({ id: 'cmd-1', statut: to });
      const result = await service.updateStatut('cmd-1', to);
      expect(repository.updateStatut).toHaveBeenCalledWith('cmd-1', to);
      expect(result.statut).toBe(to);
    }
  );

  it.each(FORBIDDEN_TRANSITIONS)(
    'forbids the invalid transition %s → %s',
    async (from, to) => {
      const { service, repository } = buildService();
      repository.findByIdSummary.mockResolvedValue({
        id: 'cmd-1',
        statut: from,
        acheteurId: 'bp-1',
      });

      await expect(
        service.updateStatut('cmd-1', to)
      ).rejects.toThrow(ConflictError);
      expect(repository.updateStatut).not.toHaveBeenCalled();
    }
  );

  it('forbids any progression from CLOTUREE', async () => {
    const { service, repository } = buildService();
    repository.findByIdSummary.mockResolvedValue({ id: 'cmd-1', statut: 'CLOTUREE' });

    for (const target of ['PREPARATION', 'EXPEDIEE', 'LIVREE', 'COMMANDE']) {
      await expect(
        service.updateStatut('cmd-1', target as any)
      ).rejects.toThrow(ConflictError);
    }
    expect(repository.updateStatut).not.toHaveBeenCalled();
  });

  it('throws NotFoundError on status update of an unknown order', async () => {
    const { service, repository } = buildService();
    repository.findByIdSummary.mockResolvedValue(null);

    await expect(
      service.updateStatut('cmd-999', 'PREPARATION')
    ).rejects.toThrow(NotFoundError);
  });

  it('allows cancellation from PREPARATION', async () => {
    const { service, repository } = buildService();
    repository.findByIdSummary.mockResolvedValue({ id: 'cmd-1', statut: 'PREPARATION' });
    repository.updateStatut.mockResolvedValue({ id: 'cmd-1', statut: 'ANNULEE' });

    const result = await service.annuler('cmd-1');
    expect(repository.updateStatut).toHaveBeenCalledWith('cmd-1', 'ANNULEE');
    expect(result.statut).toBe('ANNULEE');
  });

  it('forbids cancellation of a LIVREE order', async () => {
    const { service, repository } = buildService();
    repository.findByIdSummary.mockResolvedValue({ id: 'cmd-1', statut: 'LIVREE' });

    await expect(service.annuler('cmd-1')).rejects.toThrow(ConflictError);
  });

  it('forbids cancellation of a CLOTUREE order', async () => {
    const { service, repository } = buildService();
    repository.findByIdSummary.mockResolvedValue({ id: 'cmd-1', statut: 'CLOTUREE' });

    await expect(service.annuler('cmd-1')).rejects.toThrow(ConflictError);
  });

  it('refuses cancellation when already cancelled', async () => {
    const { service, repository } = buildService();
    repository.findByIdSummary.mockResolvedValue({ id: 'cmd-1', statut: 'ANNULEE' });

    await expect(service.annuler('cmd-1')).rejects.toThrow(ConflictError);
  });
});
