import type { PrismaClient } from '../../generated/prisma/client.js';
import { favoriListSelect, type FavoriListResult } from './favorites.types.js';

export class FavoriteRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findBuyerProfileByUserId(userId: string) {
    return this.prisma.buyerProfile.findUnique({
      where: { userId },
      select: { id: true },
    });
  }

  /**
   * Œuvre accessible dans le catalogue : seule une œuvre PUBLIEE peut être
   * ajoutée aux favoris (même règle de « catalogue accessible » que le
   * marketplace public). Une œuvre absente ou retirée retourne null → 404.
   */
  async findAccessibleOeuvre(oeuvreId: string) {
    return this.prisma.oeuvre.findFirst({
      where: { id: oeuvreId, statut: 'PUBLIEE' },
      select: { id: true },
    });
  }

  async findForAcheteur(
    acheteurId: string,
    page: number,
    limit: number
  ): Promise<FavoriListResult[]> {
    return this.prisma.favori.findMany({
      where: { acheteurId },
      orderBy: { dateCreation: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      select: { ...favoriListSelect },
    });
  }

  async countForAcheteur(acheteurId: string): Promise<number> {
    return this.prisma.favori.count({ where: { acheteurId } });
  }

  /**
   * Création idempotente : si (acheteurId, oeuvreId) existe déjà, retourne le
   * favori existant sans doublon. La contrainte unique (acheteurId, oeuvreId)
   * en base est la protection finale contre les requêtes concurrentes : une
   * violation éventuelle est absorbée par l'upsert, jamais laissée en 500.
   */
  async upsertFavorite(
    acheteurId: string,
    oeuvreId: string
  ): Promise<FavoriListResult> {
    return this.prisma.favori.upsert({
      where: { acheteurId_oeuvreId: { acheteurId, oeuvreId } },
      update: {},
      create: { acheteurId, oeuvreId },
      select: { ...favoriListSelect },
    });
  }

  /**
   * Suppression scopée : la requête combine TOUJOURS acheteurId ET oeuvreId,
   * il est donc impossible de supprimer le favori d'un autre acheteur. Un
   * favori absent ne produit aucune erreur (suppression idempotente).
   */
  async deleteByAcheteurAndOeuvre(
    acheteurId: string,
    oeuvreId: string
  ): Promise<{ count: number }> {
    return this.prisma.favori.deleteMany({
      where: { acheteurId, oeuvreId },
    });
  }
}