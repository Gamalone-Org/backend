import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeDashboardPeriod,
  DashboardService,
} from '../../src/modules/admin/dashboard/dashboard.service.js';

function createRepository() {
  return {
    countUsersByRole: vi.fn(),
    countUsersByRoleInRange: vi.fn(),
    countKycByStatus: vi.fn(),
    countArtworksByStatus: vi.fn(),
    countArtworksCreatedInRange: vi.fn(),
    countOrders: vi.fn(),
    countOrdersInRange: vi.fn(),
    countOrdersByStatus: vi.fn(),
    getOrdersDailyEvolution: vi.fn(),
    getOrdersMonthlyEvolution: vi.fn(),
    aggregateOrdersVolumeInRange: vi.fn(),
    findRecentOrders: vi.fn(),
  };
}

function mockDefaultRepository(repository: ReturnType<typeof createRepository>) {
  repository.countUsersByRole.mockResolvedValue([
    { role: 'ACHETEUR', _count: { _all: 3 } },
    { role: 'ARTISAN', _count: { _all: 2 } },
    { role: 'ADMIN', _count: { _all: 1 } },
  ]);
  repository.countUsersByRoleInRange.mockResolvedValue([
    { role: 'ACHETEUR', _count: { _all: 1 } },
    { role: 'ARTISAN', _count: { _all: 1 } },
  ]);
  repository.countKycByStatus.mockResolvedValue([
    { status: 'SOUMIS', _count: { _all: 2 } },
    { status: 'EN_ATTENTE', _count: { _all: 3 } },
    { status: 'VALIDE', _count: { _all: 5 } },
    { status: 'REJETE', _count: { _all: 1 } },
    { status: 'BROUILLON', _count: { _all: 7 } },
    { status: 'CORRECTION_REQUISE', _count: { _all: 2 } },
    { status: 'EXPIRE', _count: { _all: 0 } },
  ]);
  repository.countArtworksByStatus.mockResolvedValue([
    { statut: 'BROUILLON', _count: { _all: 3 } },
    { statut: 'EN_ATTENTE_VALIDATION', _count: { _all: 4 } },
    { statut: 'PUBLIEE', _count: { _all: 10 } },
    { statut: 'EN_PANIER', _count: { _all: 2 } },
    { statut: 'VENDUE', _count: { _all: 6 } },
    { statut: 'RETIREE', _count: { _all: 1 } },
  ]);
  repository.countArtworksCreatedInRange.mockResolvedValue(5);
  repository.countOrders.mockResolvedValue(100);
  repository.countOrdersInRange.mockResolvedValue(10);
  repository.countOrdersByStatus.mockResolvedValue([
    { statut: 'COMMANDE', _count: { _all: 40 } },
    { statut: 'PREPARATION', _count: { _all: 5 } },
    { statut: 'LIVREE', _count: { _all: 3 } },
    { statut: 'ANNULEE', _count: { _all: 2 } },
  ]);
  repository.getOrdersDailyEvolution.mockResolvedValue([]);
  repository.getOrdersMonthlyEvolution.mockResolvedValue([]);
  repository.aggregateOrdersVolumeInRange.mockResolvedValue(27500);
  repository.findRecentOrders.mockResolvedValue([]);
}

const DAY_MS = 24 * 60 * 60 * 1000;

describe('computeDashboardPeriod', () => {
  const now = new Date('2026-09-07T12:30:00.000Z');

  it('calcule les bornes d’une période 30d (from = minuit J-29, to = now)', () => {
    const { key, from, to } = computeDashboardPeriod('30d', now);

    expect(key).toBe('30d');
    expect(from.toISOString()).toBe('2026-08-09T00:00:00.000Z');
    expect(to).toBe(now);
  });

  it('calcule les bornes d’une période 7d', () => {
    const { from } = computeDashboardPeriod('7d', now);

    expect(from.toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('calcule les bornes d’une période 90d', () => {
    const { from } = computeDashboardPeriod('90d', now);

    expect(from.toISOString()).toBe('2026-06-10T00:00:00.000Z');
  });

  it('calcule les bornes d’une période 12m (premier jour du mois, 11 mois avant)', () => {
    const { key, from, to } = computeDashboardPeriod('12m', now);

    expect(key).toBe('12m');
    expect(from.toISOString()).toBe('2025-10-01T00:00:00.000Z');
    expect(to).toBe(now);
  });

  it('commence toujours à minuit UTC pour les périodes journalières', () => {
    const { from } = computeDashboardPeriod('30d', now);

    expect(from.getUTCHours()).toBe(0);
    expect(from.getUTCMinutes()).toBe(0);
    expect(from.getUTCSeconds()).toBe(0);
  });

  it('produit exactement 12 buckets mensuels consécutifs pour 12m', () => {
    const { from, to } = computeDashboardPeriod('12m', now);

    const months: string[] = [];
    const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
    while (cursor.getTime() <= to.getTime()) {
      months.push(cursor.toISOString().slice(0, 7));
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }

    expect(months).toHaveLength(12);
    expect(months[0]).toBe('2025-10');
    expect(months[11]).toBe('2026-09');
  });
});

describe('DashboardService.getDashboard', () => {
  let repository: ReturnType<typeof createRepository>;
  let service: DashboardService;

  beforeEach(() => {
    vi.clearAllMocks();
    repository = createRepository();
    mockDefaultRepository(repository);
    service = new DashboardService(repository as any);
  });

  it('mappe les indicateurs users, kyc, artworks, orders et revenue pour 30d', async () => {
    const result = await service.getDashboard('30d');

    expect(result.period.key).toBe('30d');
    expect(typeof result.period.from).toBe('string');
    expect(typeof result.period.to).toBe('string');

    expect(result.users).toEqual({
      total: 6,
      buyers: 3,
      artisans: 2,
      newUsers: 2,
      newBuyers: 1,
      newArtisans: 1,
    });

    expect(result.kyc).toEqual({ pending: 5, approved: 5, rejected: 1 });

    expect(result.artworks).toEqual({
      total: 26,
      published: 10,
      pending: 4,
      reserved: 2,
      withdrawn: 1,
      sold: 6,
      newArtworks: 5,
    });

    expect(result.orders.total).toBe(100);
    expect(result.orders.inPeriod).toBe(10);

    expect(result.revenue).toEqual({ grossOrderVolume: 27500 });
  });

  it('sépare EN_PANIER (réservées) de VENDUE (vendues)', async () => {
    repository.countArtworksByStatus.mockResolvedValue([
      { statut: 'EN_PANIER', _count: { _all: 4 } },
      { statut: 'VENDUE', _count: { _all: 9 } },
    ]);

    const result = await service.getDashboard('30d');

    expect(result.artworks.reserved).toBe(4);
    expect(result.artworks.sold).toBe(9);
  });

  it('remplit byStatus avec tous les statuts de commande, y compris les zéros', async () => {
    repository.countOrdersByStatus.mockResolvedValue([
      { statut: 'COMMANDE', _count: { _all: 40 } },
    ]);

    const result = await service.getDashboard('30d');

    expect(result.orders.byStatus).toEqual({
      COMMANDE: 40,
      PREPARATION: 0,
      EXPEDIEE: 0,
      LIVREE: 0,
      CLOTUREE: 0,
      ANNULEE: 0,
      REMBOURSEE: 0,
    });
  });

  it('construit une évolution journalière zero-filled de 30 points pour 30d', async () => {
    const { from } = computeDashboardPeriod('30d');
    const firstDay = from.toISOString().slice(0, 10);
    repository.getOrdersDailyEvolution.mockResolvedValue([
      { day: firstDay, orders: 2, volume: 2000 },
    ]);

    const result = await service.getDashboard('30d');

    expect(result.evolution).toHaveLength(30);
    expect(result.evolution[0]).toEqual({ date: firstDay, orders: 2, volume: 2000 });
    expect(result.evolution[1]).toEqual({
      date: new Date(from.getTime() + DAY_MS).toISOString().slice(0, 10),
      orders: 0,
      volume: 0,
    });
    for (let i = 1; i < result.evolution.length; i++) {
      const prev = Date.parse(result.evolution[i - 1].date);
      const next = Date.parse(result.evolution[i].date);
      expect(next - prev).toBe(DAY_MS);
    }
  });

  it('construit une évolution mensuelle zero-filled de 12 points pour 12m', async () => {
    const { from } = computeDashboardPeriod('12m');
    const firstMonth = from.toISOString().slice(0, 10);
    repository.getOrdersMonthlyEvolution.mockResolvedValue([
      { day: firstMonth, orders: 4, volume: 4000 },
    ]);

    const result = await service.getDashboard('12m');

    expect(result.evolution).toHaveLength(12);
    expect(result.evolution[0]).toEqual({ date: firstMonth, orders: 4, volume: 4000 });
    expect(result.evolution[1].orders).toBe(0);
    expect(result.evolution.every((point) => point.date.endsWith('-01'))).toBe(true);
  });

  it('utilise l’évolution mensuelle pour 12m et journalière sinon', async () => {
    await service.getDashboard('12m');
    expect(repository.getOrdersMonthlyEvolution).toHaveBeenCalledTimes(1);
    expect(repository.getOrdersDailyEvolution).not.toHaveBeenCalled();

    await service.getDashboard('30d');
    await service.getDashboard('7d');
    await service.getDashboard('90d');
    expect(repository.getOrdersDailyEvolution).toHaveBeenCalledTimes(3);
    expect(repository.getOrdersMonthlyEvolution).toHaveBeenCalledTimes(1);
  });

  it('limite les dernières commandes à 10 et renvoie la liste telle quelle', async () => {
    const recent = [
      { id: 'cmd-1', orderKey: 'ordre-nouveau' },
      { id: 'cmd-2' },
    ];
    repository.findRecentOrders.mockResolvedValue(recent as any);

    const result = await service.getDashboard('30d');

    expect(repository.findRecentOrders).toHaveBeenCalledWith(10);
    expect(result.recentOrders).toEqual(recent);
  });

  it('exécute toutes les requêtes du repository en parallèle, une fois chacune', async () => {
    await service.getDashboard('30d');

    expect(repository.countUsersByRole).toHaveBeenCalledTimes(1);
    expect(repository.countUsersByRoleInRange).toHaveBeenCalledTimes(1);
    expect(repository.countKycByStatus).toHaveBeenCalledTimes(1);
    expect(repository.countArtworksByStatus).toHaveBeenCalledTimes(1);
    expect(repository.countArtworksCreatedInRange).toHaveBeenCalledTimes(1);
    expect(repository.countOrders).toHaveBeenCalledTimes(1);
    expect(repository.countOrdersInRange).toHaveBeenCalledTimes(1);
    expect(repository.countOrdersByStatus).toHaveBeenCalledTimes(1);
    expect(repository.getOrdersDailyEvolution).toHaveBeenCalledTimes(1);
    expect(repository.aggregateOrdersVolumeInRange).toHaveBeenCalledTimes(1);
    expect(repository.findRecentOrders).toHaveBeenCalledTimes(1);
  });

  it('passe les bornes de la période (from inclus, to exclu) au count des œuvres', async () => {
    const bounds = computeDashboardPeriod('90d');

    await service.getDashboard('90d');

    const [fromArg, toArg] = repository.countArtworksCreatedInRange.mock.calls[0];
    expect(new Date(fromArg as string).toISOString()).toBe(bounds.from.toISOString());
    expect(new Date(toArg as string)).toBeInstanceOf(Date);
    expect(new Date(toArg as string).getTime()).toBeGreaterThanOrEqual(
      new Date(fromArg as string).getTime()
    );
  });
});