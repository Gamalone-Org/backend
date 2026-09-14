import { ForbiddenError } from '../../common/errors/AppError.js';
import { BuyerSettingsRepository } from './buyer-settings.repository.js';
import {
  toBuyerParametres,
  type BuyerParametres,
  type BuyerParametresUpdateData,
  type UpdateBuyerParametresInput,
} from './buyer-settings.types.js';

export class BuyerSettingsService {
  constructor(private readonly repository: BuyerSettingsRepository) {}

  /**
   * Résolution du BuyerProfile de l'utilisateur authentifié. Le profil absent
   * (compte sans profil acheteur) interdit l'accès : ForbiddenError, comme
   * dans les modules Favoris / Commandes.
   */
  private async resolveBuyerProfile(userId: string) {
    const profile = await this.repository.findBuyerProfileByUserId(userId);
    if (!profile) {
      throw new ForbiddenError('Profil acheteur introuvable');
    }
    return profile;
  }

  async getParametres(userId: string): Promise<BuyerParametres> {
    const profile = await this.resolveBuyerProfile(userId);
    return toBuyerParametres(profile);
  }

  async updateParametres(userId: string, input: UpdateBuyerParametresInput): Promise<BuyerParametres> {
    const profile = await this.resolveBuyerProfile(userId);

    const updateData: BuyerParametresUpdateData = {};

    if (input.langue !== undefined) {
      updateData.langue = input.langue;
    }

    if (input.devise !== undefined) {
      updateData.devise = input.devise;
    }

    if (input.notifications !== undefined) {
      // Mise à jour partielle du sous-objet notifications : on part des
      // valeurs actuelles puis on applique les canaux fournis (merge).
      const current = toBuyerParametres(profile).notifications;
      const next = { ...current, ...input.notifications };
      updateData.notificationsEmail = next.email;
      updateData.notificationsSms = next.sms;
      updateData.notificationsPush = next.push;
    }

    const updated = await this.repository.updateParametres(profile.id, updateData);
    return toBuyerParametres(updated);
  }
}