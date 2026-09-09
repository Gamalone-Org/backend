import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { disputeDetailSelect, disputeListItemSelect } from './dispute.types.js';
import type { DisputeDetail, DisputeListItem } from './dispute.types.js';

export type DisputeStatusValue = 'OUVERT' | 'EN_COURS' | 'RESOLU';

export type DisputeFilters = {
  q?: string;
  statut?: DisputeStatusValue;
  commandeId?: string;
  clientId?: string;
  artisanId?: string;
  dateDebut?: Date;
  dateFin?: Date;
};

/**
 * Accès aux données de litiges pour l'administration.
 *
 * Lecture seule, entièrement isolée des autres modules (Orders, KYC,
 * Marketplace...). Toutes les recherches et filtres sont exécutés côté base
 * de données via `where`; aucune navigation entre les lignes n'est effectuée.
 */
export class DisputeRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private buildWhere(filters: DisputeFilters): Prisma.LitigeWhereInput {
    const where: Prisma.LitigeWhereInput = {};

    if (filters.q) {
      where.OR = [
        // Les identifiants sont des colonnes UUID : Prisma ne permet pas
        // contains / startsWith sur UuidFilter — seule une égalité stricte
        // est possible (id du litige ou id de la commande rattachée).
        { id: { equals: filters.q } },
        { commandeId: { equals: filters.q } },
        { motif: { contains: filters.q, mode: 'insensitive' } },
        {
          artisan: {
            OR: [
              { nomAtelier: { contains: filters.q, mode: 'insensitive' } },
              { user: { nom: { contains: filters.q, mode: 'insensitive' } } },
            ],
          },
        },
        { commande: { acheteur: { user: { nom: { contains: filters.q, mode: 'insensitive' } } } } },
        {
          commande: {
            lignesCommande: { some: { oeuvre: { titre: { contains: filters.q, mode: 'insensitive' } } } },
          },
        },
      ];
    }

    if (filters.statut) {
      where.statut = filters.statut;
    }

    if (filters.commandeId) {
      where.commandeId = filters.commandeId;
    }

    if (filters.artisanId) {
      where.artisanId = filters.artisanId;
    }

    if (filters.dateDebut || filters.dateFin) {
      where.createdAt = {
        ...(filters.dateDebut ? { gte: filters.dateDebut } : {}),
        ...(filters.dateFin ? { lte: filters.dateFin } : {}),
      };
    }

    const commandeFilter: Prisma.CommandeWhereInput = {};

    if (filters.clientId) {
      commandeFilter.acheteur = { userId: filters.clientId };
    }

    if (Object.keys(commandeFilter).length > 0) {
      where.commande = commandeFilter;
    }

    return where;
  }

  async findAllForAdmin(
    page: number,
    limit: number,
    filters: DisputeFilters
  ): Promise<{ disputes: DisputeListItem[]; total: number }> {
    const where = this.buildWhere(filters);

    const [disputes, total] = await Promise.all([
      this.prisma.litige.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: disputeListItemSelect,
      }),
      this.prisma.litige.count({ where }),
    ]);

    return { disputes, total };
  }

  async findByIdForAdmin(id: string): Promise<DisputeDetail | null> {
    return this.prisma.litige.findUnique({
      where: { id },
      select: disputeDetailSelect,
    });
  }

  async findForExport(filters: DisputeFilters, limit: number): Promise<DisputeListItem[]> {
    const where = this.buildWhere(filters);

    return this.prisma.litige.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: disputeListItemSelect,
    });
  }
}