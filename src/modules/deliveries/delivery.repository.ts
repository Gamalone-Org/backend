import type { Prisma, PrismaClient, DeliveryStatus } from '../../generated/prisma/client.js';
import { deliveryDetailSelect, deliveryListItemSelect } from './delivery.types.js';
import type { DeliveryDetail, DeliveryListItem } from './delivery.types.js';

export type DeliveryFilters = {
  q?: string;
  statut?: DeliveryStatus;
};

export type DeliveryUpdateData = {
  transporteur?: string;
  numeroSuivi?: string;
};

/**
 * Accès aux données de livraison pour l'administration logistique.
 *
 * Logique lecture seule sur la relation Commande / Livraison. Aucune écriture
 * via OrderService / OrderRepository : les mises à jour sont faites
 * directement sur `prisma.livraison`.
 */
export class DeliveryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  private buildWhere(filters: DeliveryFilters): Prisma.LivraisonWhereInput {
    const where: Prisma.LivraisonWhereInput = {};

    if (filters.statut) {
      where.statut = filters.statut;
    }

    if (filters.q) {
      where.OR = [
        // Commande.id est une colonne UUID : Prisma ne permet pas contains /
        // startsWith sur UuidFilter — seule une égalité stricte est possible.
        { commande: { id: { equals: filters.q } } },
        { numeroSuivi: { contains: filters.q, mode: 'insensitive' } },
        { transporteur: { contains: filters.q, mode: 'insensitive' } },
        { adresseDest: { contains: filters.q, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  async findAllForAdmin(
    page: number,
    limit: number,
    filters: DeliveryFilters
  ): Promise<{ livraisons: DeliveryListItem[]; total: number }> {
    const where = this.buildWhere(filters);

    const [livraisons, total] = await Promise.all([
      this.prisma.livraison.findMany({
        where,
        orderBy: { commande: { dateCreation: 'desc' } },
        skip: (page - 1) * limit,
        take: limit,
        select: deliveryListItemSelect,
      }),
      this.prisma.livraison.count({ where }),
    ]);

    return { livraisons, total };
  }

  async findByIdForAdmin(id: string): Promise<DeliveryDetail | null> {
    return this.prisma.livraison.findUnique({
      where: { id },
      select: deliveryDetailSelect,
    });
  }

  async findByIdSummary(id: string): Promise<{ id: string; statut: DeliveryStatus } | null> {
    return this.prisma.livraison.findUnique({
      where: { id },
      select: { id: true, statut: true },
    });
  }

  async updateDelivery(id: string, data: DeliveryUpdateData) {
    return this.prisma.livraison.update({
      where: { id },
      data,
      select: {
        id: true,
        transporteur: true,
        numeroSuivi: true,
        statut: true,
      },
    });
  }

  async updateStatus(id: string, statut: DeliveryStatus) {
    return this.prisma.livraison.update({
      where: { id },
      data: { statut },
      select: { id: true, statut: true },
    });
  }

  async findForExport(filters: DeliveryFilters, limit: number): Promise<DeliveryListItem[]> {
    const where = this.buildWhere(filters);

    return this.prisma.livraison.findMany({
      where,
      orderBy: { commande: { dateCreation: 'desc' } },
      take: limit,
      select: deliveryListItemSelect,
    });
  }
}