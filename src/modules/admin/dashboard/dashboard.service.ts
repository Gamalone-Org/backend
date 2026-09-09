import { OrderStatus } from '../../../generated/prisma/client.js';
import type { UserRole } from '../../../generated/prisma/client.js';
import { DashboardRepository } from './dashboard.repository.js';
import type {
  ArtworkStatusCount,
  DashboardArtworks,
  DashboardKyc,
  DashboardOrders,
  DashboardPeriodKey,
  DashboardResult,
  DashboardUsers,
  EvolutionPoint,
  EvolutionRow,
  KycStatusCount,
  OrderStatusCount,
  PeriodBounds,
  RoleCount,
} from './dashboard.types.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const PERIOD_DAYS: Record<Exclude<DashboardPeriodKey, '12m'>, number> = {
  '7d': 7,
  '30d': 30,
  '90d': 90,
};

const MONTHLY_BUCKETS = 12;

function midnightUtc(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Calcule les bornes temporelles de la période.
 *
 * Toutes les bornes sont en UTC. `from` est inclusif, `to` est exclusif.
 * L'évolution est construite sur des périodes calendaires complètes afin de
 * renvoyer exactement 7, 30, 90 buckets journaliers ou 12 buckets mensuels :
 * - 7d / 30d / 90d : `from` = minuit UTC du (n - 1)-ième jour précédent,
 *   `to` = maintenant.
 * - 12m : `from` = premier jour du mois, 11 mois avant le mois courant,
 *   `to` = maintenant (12 mois calendaires complets renvoyés).
 */
export function computeDashboardPeriod(
  key: DashboardPeriodKey,
  now: Date = new Date()
): PeriodBounds {
  const to = now;

  if (key === '12m') {
    const thisMonthStart = midnightUtc(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)));
    const from = new Date(
      Date.UTC(thisMonthStart.getUTCFullYear(), thisMonthStart.getUTCMonth() - (MONTHLY_BUCKETS - 1), 1)
    );
    return { key, from, to };
  }

  const days = PERIOD_DAYS[key];
  const from = new Date(midnightUtc(now).getTime() - (days - 1) * DAY_MS);
  return { key, from, to };
}

function sumRoleCounts(rows: RoleCount[]): number {
  return rows.reduce((sum, row) => sum + row._count._all, 0);
}

function countRole(rows: RoleCount[], role: UserRole): number {
  const row = rows.find((entry) => entry.role === role);
  return row?._count._all ?? 0;
}

function buildUsers(allRows: RoleCount[], newRows: RoleCount[]): DashboardUsers {
  return {
    total: sumRoleCounts(allRows),
    buyers: countRole(allRows, 'ACHETEUR'),
    artisans: countRole(allRows, 'ARTISAN'),
    newUsers: sumRoleCounts(newRows),
    newBuyers: countRole(newRows, 'ACHETEUR'),
    newArtisans: countRole(newRows, 'ARTISAN'),
  };
}

/**
 * Mapping statut KYC réel → métrique dashboard.
 *
 * Statuts réels (KycStatus) : BROUILLON, SOUMIS, EN_ATTENTE, VALIDE, REJETE,
 * CORRECTION_REQUISE, EXPIRE.
 *
 * `pending` agrège les deux statuts "en cours de revue" utilisés par le
 * workflow KYC existant (SOUMIS + EN_ATTENTE) pour rester cohérent avec la
 * file de revue admin déjà en place. `approved` = VALIDE, `rejected` = REJETE.
 */
function buildKyc(rows: KycStatusCount[]): DashboardKyc {
  const counts = new Map<KycStatusCount['status'], number>(
    rows.map((row) => [row.status, row._count._all])
  );
  return {
    pending: (counts.get('SOUMIS') ?? 0) + (counts.get('EN_ATTENTE') ?? 0),
    approved: counts.get('VALIDE') ?? 0,
    rejected: counts.get('REJETE') ?? 0,
  };
}

/**
 * Mapping statut œuvre réel → métrique dashboard.
 *
 * Statuts réels (ArtworkStatus) : BROUILLON, EN_ATTENTE_VALIDATION, PUBLIEE,
 * EN_PANIER, VENDUE, RETIREE.
 *
 * EN_PANIER (réservé en attente du paiement) est une métrique SÉPARÉE
 * (`reserved`), jamais mélangée avec VENDUE : une œuvre en panier n'est pas
 * encore vendue.
 */
function buildArtworks(rows: ArtworkStatusCount[], newArtworks: number): DashboardArtworks {
  const counts = new Map<ArtworkStatusCount['statut'], number>(
    rows.map((row) => [row.statut, row._count._all])
  );
  return {
    total: rows.reduce((sum, row) => sum + row._count._all, 0),
    published: counts.get('PUBLIEE') ?? 0,
    pending: counts.get('EN_ATTENTE_VALIDATION') ?? 0,
    reserved: counts.get('EN_PANIER') ?? 0,
    withdrawn: counts.get('RETIREE') ?? 0,
    sold: counts.get('VENDUE') ?? 0,
    newArtworks,
  };
}

/**
 * Répartition stable des commandes par statut : tous les statuts réels
 * (OrderStatus) sont présents, même à zéro, pour faciliter le frontend.
 */
function buildOrders(
  total: number,
  inPeriod: number,
  rows: OrderStatusCount[]
): DashboardOrders {
  const byStatus = Object.fromEntries(
    Object.values(OrderStatus).map((statut) => [statut, 0])
  ) as DashboardOrders['byStatus'];

  for (const row of rows) {
    byStatus[row.statut] = row._count._all;
  }

  return { total, inPeriod, byStatus };
}

function buildDailyEvolution(
  days: number,
  from: Date,
  rows: Map<string, EvolutionRow>
): EvolutionPoint[] {
  const buckets: EvolutionPoint[] = [];
  let cursor = from;
  for (let i = 0; i < days; i++) {
    const date = utcDayKey(cursor);
    const row = rows.get(date);
    buckets.push({
      date,
      orders: row?.orders ?? 0,
      volume: row ? Number(row.volume) : 0,
    });
    cursor = new Date(cursor.getTime() + DAY_MS);
  }
  return buckets;
}

function buildMonthlyEvolution(
  from: Date,
  rows: Map<string, EvolutionRow>
): EvolutionPoint[] {
  const buckets: EvolutionPoint[] = [];
  let cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  for (let i = 0; i < MONTHLY_BUCKETS; i++) {
    const date = utcDayKey(cursor);
    const row = rows.get(date);
    buckets.push({
      date,
      orders: row?.orders ?? 0,
      volume: row ? Number(row.volume) : 0,
    });
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return buckets;
}

/**
 * Série temporelle avec les périodes sans commande incluses (zero-filled).
 * 7d/30d/90d → quotidienne, 12m → mensuelle.
 */
function buildEvolution(
  key: DashboardPeriodKey,
  from: Date,
  rows: EvolutionRow[]
): EvolutionPoint[] {
  const byDate = new Map<string, EvolutionRow>(
    rows.map((row) => [row.day, row])
  );

  return key === '12m'
    ? buildMonthlyEvolution(from, byDate)
    : buildDailyEvolution(PERIOD_DAYS[key], from, byDate);
}

export class DashboardService {
  constructor(private readonly repository: DashboardRepository) {}

  async getDashboard(period: DashboardPeriodKey): Promise<DashboardResult> {
    const { key, from, to } = computeDashboardPeriod(period);

    const [
      usersByRole,
      newUsersByRole,
      kycByStatus,
      artworksByStatus,
      newArtworks,
      totalOrders,
      ordersInPeriod,
      ordersByStatus,
      evolutionRows,
      recentOrders,
      grossOrderVolume,
    ] = await Promise.all([
      this.repository.countUsersByRole(),
      this.repository.countUsersByRoleInRange(from, to),
      this.repository.countKycByStatus(),
      this.repository.countArtworksByStatus(),
      this.repository.countArtworksCreatedInRange(from, to),
      this.repository.countOrders(),
      this.repository.countOrdersInRange(from, to),
      this.repository.countOrdersByStatus(),
      key === '12m'
        ? this.repository.getOrdersMonthlyEvolution(from, to)
        : this.repository.getOrdersDailyEvolution(from, to),
      this.repository.findRecentOrders(10),
      this.repository.aggregateOrdersVolumeInRange(from, to),
    ]);

    return {
      period: {
        key,
        from: from.toISOString(),
        to: to.toISOString(),
      },
      users: buildUsers(usersByRole, newUsersByRole),
      kyc: buildKyc(kycByStatus),
      artworks: buildArtworks(artworksByStatus, newArtworks),
      orders: buildOrders(totalOrders, ordersInPeriod, ordersByStatus),
      revenue: { grossOrderVolume },
      evolution: buildEvolution(key, from, evolutionRows),
      recentOrders,
    };
  }
}