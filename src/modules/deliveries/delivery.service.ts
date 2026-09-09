import { NotFoundError } from '../../common/errors/AppError.js';
import type { DeliveryStatus } from '../../generated/prisma/client.js';
import { DeliveryRepository, type DeliveryFilters, type DeliveryUpdateData } from './delivery.repository.js';

export const CSV_EXPORT_LIMIT = 5000;

/**
 * Orchestration de la logistique admin (Phase 1 : gestion interne manuelle).
 *
 * La création des livraisons relève de la transaction de création de commande
 * (module Orders). Ce service ne contient aucune logique de création de
 * commande : il ne fait que lire et mettre à jour les expéditions existantes.
 */
export class DeliveryService {
  constructor(private readonly repository: DeliveryRepository) {}

  async listAllAdmin(page: number, limit: number, filters: DeliveryFilters) {
    const { livraisons, total } = await this.repository.findAllForAdmin(page, limit, filters);
    const totalPages = total === 0 ? 0 : Math.ceil(total / limit);
    return { items: livraisons, total, page, limit, totalPages };
  }

  async getDeliveryAdmin(id: string) {
    const livraison = await this.repository.findByIdForAdmin(id);
    if (!livraison) {
      throw new NotFoundError('Livraison introuvable');
    }
    return livraison;
  }

  async updateDelivery(id: string, data: DeliveryUpdateData) {
    const existing = await this.repository.findByIdSummary(id);
    if (!existing) {
      throw new NotFoundError('Livraison introuvable');
    }
    return this.repository.updateDelivery(id, data);
  }

  async updateStatus(id: string, statut: DeliveryStatus) {
    const existing = await this.repository.findByIdSummary(id);
    if (!existing) {
      throw new NotFoundError('Livraison introuvable');
    }
    return this.repository.updateStatus(id, statut);
  }

  async exportCsv(filters: DeliveryFilters) {
    const livraisons = await this.repository.findForExport(filters, CSV_EXPORT_LIMIT);

    const header = [
      'idLivraison',
      'idCommande',
      'transporteur',
      'numeroSuivi',
      'destination',
      'frais',
      'statut',
      'dateCommande',
    ];

    const rows = livraisons.map((l) => [
      l.id,
      l.commande?.id ?? '',
      l.transporteur,
      l.numeroSuivi ?? '',
      l.adresseDest,
      l.frais,
      l.statut,
      l.commande ? new Date(l.commande.dateCreation).toISOString() : '',
    ]);

    const csv = [header, ...rows]
      .map((row) => row.map((cell) => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
      .join('\n');

    return csv;
  }
}