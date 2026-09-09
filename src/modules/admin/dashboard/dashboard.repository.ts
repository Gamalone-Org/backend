import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { EvolutionRow, RecentOrder } from './dashboard.types.js';

/**
 * Accès aux données agrégées pour le dashboard admin.
 *
 * Toutes les requêtes sont des count / groupBy / aggregate / $queryRaw ciblées :
 * PostgreSQL fait le travail d'agrégation, on ne charge jamais la totalité des
 * lignes en mémoire. Aucun include lourd, aucune relation inutile.
 *
 * Convention temporelle : bornes inclusives/exclusives en UTC sur `createdAt`
 * (from inclus, to exclu).
 */
export class DashboardRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /** Répartition de tous les utilisateurs non supprimés par rôle. */
  countUsersByRole() {
    return this.prisma.user.groupBy({
      by: ['role'],
      where: { deletedAt: null },
      _count: { _all: true },
    });
  }

  /** Répartition des utilisateurs non supprimés créés sur la période par rôle. */
  countUsersByRoleInRange(from: Date, to: Date) {
    return this.prisma.user.groupBy({
      by: ['role'],
      where: { deletedAt: null, createdAt: { gte: from, lt: to } },
      _count: { _all: true },
    });
  }

  /** Répartition des dossiers KYC (non supprimés, non anonymisés) par statut. */
  countKycByStatus() {
    return this.prisma.kyc.groupBy({
      by: ['status'],
      where: { deletedAt: null, anonymizedAt: null },
      _count: { _all: true },
    });
  }

  /** Répartition des œuvres par statut. */
  countArtworksByStatus() {
    return this.prisma.oeuvre.groupBy({
      by: ['statut'],
      _count: { _all: true },
    });
  }

  /** Nombre d'œuvres créées sur la période. */
  countArtworksCreatedInRange(from: Date, to: Date): Promise<number> {
    return this.prisma.oeuvre.count({
      where: { createdAt: { gte: from, lt: to } },
    });
  }

  /** Nombre total de commandes. */
  countOrders(): Promise<number> {
    return this.prisma.commande.count();
  }

  /** Nombre de commandes créées sur la période. */
  countOrdersInRange(from: Date, to: Date): Promise<number> {
    return this.prisma.commande.count({
      where: { createdAt: { gte: from, lt: to } },
    });
  }

  /** Répartition de toutes les commandes par statut actuel. */
  countOrdersByStatus() {
    return this.prisma.commande.groupBy({
      by: ['statut'],
      _count: { _all: true },
    });
  }

  /**
   * Somme des montants totaux des commandes créées sur la période.
   *
   * ATTENTION : le paiement réel n'est pas encore implémenté. Cette somme
   * représente le VOLUME BRUT des commandes, pas un chiffre d'affaires
   * définitivement encaissé. Aucun statut de paiement n'est utilisé ici.
   */
  async aggregateOrdersVolumeInRange(from: Date, to: Date): Promise<number> {
    const result = await this.prisma.commande.aggregate({
      where: { createdAt: { gte: from, lt: to } },
      _sum: { montantTotal: true },
    });
    return Number(result._sum.montantTotal ?? 0);
  }

  /**
   * Série temporelle journalière : une ligne par jour ayant au moins une
   * commande. Les jours sans commande sont complétés côté service.
   */
  getOrdersDailyEvolution(from: Date, to: Date): Promise<EvolutionRow[]> {
    return this.prisma.$queryRaw<EvolutionRow[]>`
      SELECT TO_CHAR(DATE_TRUNC('day', "createdAt"), 'YYYY-MM-DD') AS "day",
             COUNT(*)::int AS "orders",
             COALESCE(SUM("montantTotal"), 0)::float8 AS "volume"
      FROM "commandes"
      WHERE "createdAt" >= ${from}
        AND "createdAt" < ${to}
      GROUP BY 1
      ORDER BY 1 ASC
    `;
  }

  /**
   * Série temporelle mensuelle : une ligne par mois ayant au moins une
   * commande. Les mois sans commande sont complétés côté service.
   */
  getOrdersMonthlyEvolution(from: Date, to: Date): Promise<EvolutionRow[]> {
    return this.prisma.$queryRaw<EvolutionRow[]>`
      SELECT TO_CHAR(DATE_TRUNC('month', "createdAt"), 'YYYY-MM-01') AS "day",
             COUNT(*)::int AS "orders",
             COALESCE(SUM("montantTotal"), 0)::float8 AS "volume"
      FROM "commandes"
      WHERE "createdAt" >= ${from}
        AND "createdAt" < ${to}
      GROUP BY 1
      ORDER BY 1 ASC
    `;
  }

  /**
   * Dernières commandes (maximum 10), triées de la plus récente à la plus
   * ancienne. Sélecteur minimal : pas de lignes, pas de paiement, pas de
   * documents, seulement les informations nécessaires au tableau de bord.
   */
  async findRecentOrders(limit: number = 10): Promise<RecentOrder[]> {
    const rows = await this.prisma.commande.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        dateCreation: true,
        statut: true,
        montantTotal: true,
        createdAt: true,
        acheteur: {
          select: {
            id: true,
            typeClient: true,
            user: {
              select: {
                id: true,
                nom: true,
                telephone: true,
              },
            },
          },
        },
      },
    });

    return rows.map((row) => ({ ...row, montantTotal: Number(row.montantTotal) }));
  }
}