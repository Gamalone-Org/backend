import type { PrismaClient } from '../../generated/prisma/client.js';
import {
  buyerParametresSelect,
  type BuyerParametresRow,
  type BuyerParametresUpdateData,
} from './buyer-settings.types.js';

export class BuyerSettingsRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Résolution scopée du BuyerProfile par l'utilisateur authentifié : la
   * requête est TOUJOURS clé sur userId (jamais un id fourni par le client),
   * il est donc impossible de lire les paramètres d'un autre acheteur.
   */
  findBuyerProfileByUserId(userId: string): Promise<BuyerParametresRow | null> {
    return this.prisma.buyerProfile.findUnique({
      where: { userId },
      select: { ...buyerParametresSelect },
    });
  }

  /**
   * Mise à jour des paramètres. Le profile est résolu côté serveur (id du
   * BuyerProfile connecté), jamais depuis le body : l'ownership est garanti.
   */
  updateParametres(
    buyerProfileId: string,
    data: BuyerParametresUpdateData
  ): Promise<BuyerParametresRow> {
    return this.prisma.buyerProfile.update({
      where: { id: buyerProfileId },
      data,
      select: { ...buyerParametresSelect },
    });
  }
}