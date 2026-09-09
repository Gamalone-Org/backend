import type { Prisma, PrismaClient } from '../../generated/prisma/client.js';
import { reviewDetailSelect, reviewListItemSelect } from './review.types.js';
import type { ReviewDetail, ReviewListItem } from './review.types.js';

export type ReviewFilters = {
  q?: string;
  note?: number;
  estVerifie?: boolean;
  dateDebut?: Date;
  dateFin?: Date;
  commandeId?: string;
  auteurId?: string;
  oeuvreId?: string;
  artisanId?: string;
};

/**
 * Accès aux données d'avis pour l'administration.
 *
 * Lecture seule, entièrement isolée des autres modules (Orders, KYC,
 * Marketplace...). Toutes les recherches et filtres sont exécutés côté base
 * de données via `where`; aucune navigation entre les lignes n'est effectuée.
 */
export class ReviewRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private buildWhere(filters: ReviewFilters): Prisma.AvisWhereInput {
    const where: Prisma.AvisWhereInput = {};

    if (filters.q) {
      where.OR = [
        // Les identifiants sont des colonnes UUID : Prisma ne permet pas
        // contains / startsWith sur UuidFilter — seule une égalité stricte
        // est possible (id de l'avis ou id de la commande rattachée).
        { id: { equals: filters.q } },
        { commandeId: { equals: filters.q } },
        { commentaire: { contains: filters.q, mode: 'insensitive' } },
        { commande: { acheteur: { user: { nom: { contains: filters.q, mode: 'insensitive' } } } } },
        {
          commande: {
            lignesCommande: { some: { oeuvre: { titre: { contains: filters.q, mode: 'insensitive' } } } },
          },
        },
      ];
    }

    if (filters.note !== undefined) {
      where.note = filters.note;
    }

    if (filters.estVerifie !== undefined) {
      where.estVerifie = filters.estVerifie;
    }

    if (filters.dateDebut || filters.dateFin) {
      where.dateAvis = {
        ...(filters.dateDebut ? { gte: filters.dateDebut } : {}),
        ...(filters.dateFin ? { lte: filters.dateFin } : {}),
      };
    }

    if (filters.commandeId) {
      where.commandeId = filters.commandeId;
    }

    const commandeFilter: Prisma.CommandeWhereInput = {};
    const ligneCommandeFilter: Prisma.LigneCommandeWhereInput = {};

    if (filters.auteurId) {
      commandeFilter.acheteur = { userId: filters.auteurId };
    }

    if (filters.oeuvreId) {
      ligneCommandeFilter.oeuvreId = filters.oeuvreId;
    }

    if (filters.artisanId) {
      ligneCommandeFilter.artisanId = filters.artisanId;
    }

    if (Object.keys(ligneCommandeFilter).length > 0) {
      commandeFilter.lignesCommande = { some: ligneCommandeFilter };
    }

    if (Object.keys(commandeFilter).length > 0) {
      where.commande = commandeFilter;
    }

    return where;
  }

  async findAllForAdmin(
    page: number,
    limit: number,
    filters: ReviewFilters
  ): Promise<{ reviews: ReviewListItem[]; total: number }> {
    const where = this.buildWhere(filters);

    const [reviews, total] = await Promise.all([
      this.prisma.avis.findMany({
        where,
        orderBy: { dateAvis: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        select: reviewListItemSelect,
      }),
      this.prisma.avis.count({ where }),
    ]);

    return { reviews, total };
  }

  async findByIdForAdmin(id: string): Promise<ReviewDetail | null> {
    return this.prisma.avis.findUnique({
      where: { id },
      select: reviewDetailSelect,
    });
  }

  async findForExport(filters: ReviewFilters, limit: number): Promise<ReviewListItem[]> {
    const where = this.buildWhere(filters);

    return this.prisma.avis.findMany({
      where,
      orderBy: { dateAvis: 'desc' },
      take: limit,
      select: reviewListItemSelect,
    });
  }
}