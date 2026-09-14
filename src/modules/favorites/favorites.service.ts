import { ForbiddenError, NotFoundError } from '../../common/errors/AppError.js';
import { FavoriteRepository } from './favorites.repository.js';

export class FavoriteService {
  constructor(private readonly repository: FavoriteRepository) {}

  /**
   * Liste paginée des favoris du BuyerProfile connecté. La liste conserve le
   * lien vers l'œuvre et expose son statut actuel (même si l'œuvre est
   * devenue VENDUE / RETIREE) : aucun favori n'est supprimé automatiquement.
   */
  async getMyFavorites(userId: string, page: number, limit: number) {
    const buyerProfile = await this.repository.findBuyerProfileByUserId(userId);
    if (!buyerProfile) {
      throw new ForbiddenError('Profil acheteur introuvable');
    }
    const [favoris, total] = await Promise.all([
      this.repository.findForAcheteur(buyerProfile.id, page, limit),
      this.repository.countForAcheteur(buyerProfile.id),
    ]);
    return { favoris, total, page, limit };
  }

  async addFavorite(userId: string, oeuvreId: string) {
    const buyerProfile = await this.repository.findBuyerProfileByUserId(userId);
    if (!buyerProfile) {
      throw new ForbiddenError('Profil acheteur introuvable');
    }
    const oeuvre = await this.repository.findAccessibleOeuvre(oeuvreId);
    if (!oeuvre) {
      throw new NotFoundError('Œuvre introuvable ou indisponible');
    }
    const favori = await this.repository.upsertFavorite(buyerProfile.id, oeuvreId);
    return favori;
  }

  /**
   * Suppression d'un favori. Idempotente : aucun favori (ou favori déjà
   * retiré) n'est une erreur. La suppression est scopée par le BuyerProfile
   * connecté, un autre acheteur ne peut jamais supprimer ce favori.
   */
  async removeFavorite(userId: string, oeuvreId: string) {
    const buyerProfile = await this.repository.findBuyerProfileByUserId(userId);
    if (!buyerProfile) {
      throw new ForbiddenError('Profil acheteur introuvable');
    }
    await this.repository.deleteByAcheteurAndOeuvre(buyerProfile.id, oeuvreId);
  }
}